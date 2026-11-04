import { z } from "zod";
import type { AgentTemplate, Squad, Team } from "../schema/team";
import type { SimpleStep } from "../schema/simple";
import { parseWorkflow, syncSimpleWorkflow, type Workflow } from "../schema/workflow";

/**
 * The main agent (one per workspace) turns a request into a **plan**: steps with
 * who / what / after which step / needs approval. A plan runs as an ordinary
 * step-list workflow (buildGraphFromSteps), so the engine, events, office,
 * approvals and cost caps don't change. The last step always belongs to the
 * main agent, which combines the results into one reply.
 *
 * Everything here is runtime-agnostic: the plan comes back as a fenced ```plan
 * JSON block in the main agent's answer, whatever runtime it ran on.
 */

/** Marks a planning prompt (the practice runtime answers it with a predictable plan). */
export const PLAN_MARKER = "[agent-town:plan]";
/** Marks a direct chat with a sub-agent. */
export const CHAT_MARKER = "[agent-town:chat]";
/** Marks the main agent's final "combine the results" step. */
export const COMBINE_MARKER = "Combine the team's results into one reply";

export const MAX_PLAN_STEPS = 8;

export const PlanStep = z.object({
  /** Agent id, or "squad:<id>" to give the step to a squad. */
  who: z.string().min(1),
  title: z.string().min(1).max(80),
  what: z.string().min(1).max(4000),
  /** Step numbers (1-based) this step waits for. Missing = the step before it. */
  after: z.array(z.number().int().positive()).optional(),
  needsApproval: z.boolean().default(false),
  /** Agent who checks the result and may send it back once or more. */
  reviewBy: z.string().optional(),
  outputFile: z.string().regex(/^[\w.-]{1,60}$/).optional(),
});
export type PlanStep = z.infer<typeof PlanStep>;

export const Plan = z.object({
  /** What the main agent says back in the chat. */
  reply: z.string().max(4000).default(""),
  /** Defaults it assumed. */
  assumptions: z.array(z.string().max(300)).max(8).default([]),
  /** Use a saved workflow instead of new steps (its id). */
  workflow: z.string().optional(),
  steps: z.array(PlanStep).max(MAX_PLAN_STEPS).default([]),
});
export type Plan = z.infer<typeof Plan>;

export class PlanError extends Error {}

export interface PlanContext {
  /** The request in the user's words. */
  request: string;
  team: Team;
  /** Saved workflows of this workspace the main agent may reuse. */
  workflows?: Array<{ id: string; name: string; description?: string }>;
  /** Earlier messages in the chat (oldest first), for follow-ups. */
  history?: Array<{ from: string; text: string }>;
}

/** The sub-agents a plan may name: the workspace's members, never the main agent itself. */
export function subAgents(team: Team): AgentTemplate[] {
  return team.agents.filter((a) => a.id !== team.mainAgentId && team.memberIds.includes(a.id));
}

export function mainAgentOf(team: Team): AgentTemplate | undefined {
  return team.agents.find((a) => a.id === team.mainAgentId);
}

/** A new workspace's main agent (plain data; the user can rename it and change its model). */
export function mainAgentTemplate(team: Pick<Team, "id" | "name">, sprite = "default"): AgentTemplate {
  return {
    id: `main-${team.id}`.slice(0, 80),
    name: "Main agent",
    role: "Main agent",
    department: "Leadership",
    description: "Plans the work, hands it to the team and combines the results.",
    systemPrompt:
      "You lead this workspace. Turn each request into a short plan for your team, give every step to the teammate who fits it best, " +
      "and when the work is done, combine it into one clear reply. Keep plans small. Ask for approval before anything is sent or paid for.",
    tools: [],
    skills: [],
    permissions: { autoApproveWrite: false, shell: false },
    appearance: { color: "#7c5cff", sprite },
  };
}

/** Text from people or models never becomes a template reference ({{nodes.x.output}}). */
const noTpl = (s: string) => s.replace(/\{\{|\}\}/g, "");
const line = (s: string, max = 200) => noTpl(s).replace(/\s+/g, " ").trim().slice(0, max);

/** The prompt that asks the main agent for a plan. */
export function plannerPrompt(ctx: PlanContext): string {
  const { team } = ctx;
  const roster = subAgents(team).map((a) => `${a.id} | ${line(a.name, 60)} | ${line(a.role, 60)} | ${line(a.description, 140)}`);
  const squads = team.squads.map((s) => `squad:${s.id} | ${line(s.name, 60)} | lead: ${s.leadId} | members: ${s.memberIds.join(", ")}`);
  const workflows = (ctx.workflows ?? []).map((w) => `${w.id} | ${line(w.name, 80)} | ${line(w.description ?? "", 140)}`);
  const history = (ctx.history ?? []).slice(-6).map((m) => `${m.from}: ${line(m.text, 400)}`);
  return [
    PLAN_MARKER,
    `You are the main agent of the workspace "${line(team.name, 80)}".${team.goal ? ` Its goal: ${line(team.goal, 400)}` : ""}`,
    "Make a short plan for the request below. Give each step to ONE teammate (by id) or to a squad (squad:<id>).",
    "Steps run in order; set `after` to the step numbers a step waits for (steps waiting for the same ones run side by side).",
    "Set needsApproval for anything that should be checked by the person first, and reviewBy for a teammate who checks a step.",
    "If a saved workflow already does this, set `workflow` to its id instead of steps. If no work is needed, answer in `reply` with no steps.",
    "You will combine the results yourself at the end, so don't add a step for that.",
    "Answer in plain words, then end with exactly one fenced block:",
    '```plan\n{"reply": "…", "assumptions": ["…"], "steps": [{"who": "<id>", "title": "…", "what": "…", "after": [1], "needsApproval": false, "reviewBy": "<id>"}]}\n```',
    "",
    "<team>",
    ...roster,
    "</team>",
    ...(squads.length ? ["<squads>", ...squads, "</squads>"] : []),
    ...(workflows.length ? ["<workflows>", ...workflows, "</workflows>"] : []),
    ...(history.length ? ["<chat>", ...history, "</chat>"] : []),
    "<request>",
    line(ctx.request, 2000),
    "</request>",
  ].join("\n");
}

/** Pull the plan out of the main agent's answer and check it against the team. */
export function parsePlan(answer: string, team: Team, workflowIds: string[] = []): Plan {
  const m = /```plan\s*\n([\s\S]*?)```/.exec(answer) ?? /```json\s*\n([\s\S]*?)```/.exec(answer);
  if (!m) throw new PlanError("The main agent didn't return a plan");
  let raw: unknown;
  try {
    raw = JSON.parse(m[1]!);
  } catch {
    throw new PlanError("The main agent's plan isn't valid JSON");
  }
  const parsed = Plan.safeParse(raw);
  if (!parsed.success) throw new PlanError(`The plan doesn't have the right shape: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  const plan = parsed.data;
  if (!plan.reply) plan.reply = answer.slice(0, m.index).trim().slice(0, 4000);
  if (plan.workflow) {
    if (!workflowIds.includes(plan.workflow)) throw new PlanError(`The plan names a workflow this workspace doesn't have (${plan.workflow})`);
    return { ...plan, steps: [] };
  }
  const members = new Set(subAgents(team).map((a) => a.id));
  const squads = new Map(team.squads.map((s) => [`squad:${s.id}`, s]));
  plan.steps.forEach((s, i) => {
    if (!members.has(s.who) && !squads.has(s.who)) throw new PlanError(`Step ${i + 1} is given to "${s.who}", who isn't on this team`);
    if (s.reviewBy && !members.has(s.reviewBy)) throw new PlanError(`Step ${i + 1} is reviewed by "${s.reviewBy}", who isn't on this team`);
    for (const a of s.after ?? []) if (a > i) throw new PlanError(`Step ${i + 1} waits for step ${a}, which comes later`);
  });
  return plan;
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Plan → step list. Steps that wait for the same earlier steps run side by side;
 * squad steps become one step per member (side by side) and a lead step that
 * pulls the squad's work together. A final step by the main agent combines everything.
 */
export function planToSteps(plan: Plan, team: Team, request: string): SimpleStep[] {
  const steps: SimpleStep[] = [];
  const titles: Array<{ id: string; title: string; who: string }> = [];
  const nameOf = (id: string) => team.agents.find((a) => a.id === id)?.name ?? id;
  const deps = plan.steps.map((s, i) => s.after ?? (i ? [i] : []));
  plan.steps.forEach((s, i) => {
    const n = i + 1;
    const parallel = i > 0 && sameSet(deps[i]!, deps[i - 1]!) && !deps[i]!.includes(i);
    const squad = s.who.startsWith("squad:") ? team.squads.find((q) => `squad:${q.id}` === s.who) : undefined;
    if (squad) {
      steps.push(...squadSteps(squad, s, n, parallel));
      const last = steps.at(-1)!;
      titles.push({ id: last.id, title: s.title, who: last.who });
      return;
    }
    steps.push({
      id: `p${n}`,
      title: s.title,
      who: s.who,
      what: noTpl(s.what),
      ...(s.outputFile ? { outputFile: s.outputFile } : {}),
      ...(s.reviewBy && s.reviewBy !== s.who ? { reviewBy: s.reviewBy } : {}),
      needsApproval: s.needsApproval,
      parallelWithPrevious: parallel,
    });
    titles.push({ id: `p${n}`, title: s.title, who: s.who });
  });
  if (team.mainAgentId) {
    steps.push({
      id: "combine",
      title: "Combine and reply",
      who: team.mainAgentId,
      what: [
        `${COMBINE_MARKER} for this request:`,
        line(request, 2000),
        "",
        ...titles.flatMap((t) => [`### ${t.title} (${nameOf(t.who)})`, `{{nodes.s-${t.id}.output}}`, ""]),
        "Say what was done, the key results, and anything the person should decide next.",
      ].join("\n"),
      needsApproval: false,
      parallelWithPrevious: false,
    });
  }
  return steps;
}

function squadSteps(squad: Squad, s: PlanStep, n: number, parallel: boolean): SimpleStep[] {
  const helpers = squad.memberIds.filter((m) => m !== squad.leadId);
  const lead = squad.leadId || helpers[0] || "";
  if (!helpers.length) return [{ id: `p${n}`, title: s.title, who: lead, what: noTpl(s.what), needsApproval: s.needsApproval, parallelWithPrevious: parallel }];
  const parts: SimpleStep[] = helpers.map((m, k) => ({
    id: `p${n}-${k + 1}`,
    title: `${s.title} (part ${k + 1})`,
    who: m,
    what: `${noTpl(s.what)}\n\nYou're in the ${squad.name}. Do your part; your squad lead pulls it together.`,
    needsApproval: false,
    parallelWithPrevious: k === 0 ? parallel : true,
  }));
  const lead_: SimpleStep = {
    id: `p${n}`,
    title: s.title,
    who: lead,
    what: `${noTpl(s.what)}\n\nYou lead the ${squad.name}. Pull your squad's parts together into one result.`,
    needsApproval: s.needsApproval,
    parallelWithPrevious: false,
    ...(s.reviewBy && s.reviewBy !== lead ? { reviewBy: s.reviewBy } : {}),
  };
  return [...parts, lead_];
}

// --- the practice runtime's planner ------------------------------------------

interface Row {
  id: string;
  name: string;
  role: string;
}

function block(prompt: string, tag: string): string[] {
  const m = new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt);
  return m ? m[1]!.split("\n").filter(Boolean) : [];
}

/**
 * What the practice runtime answers to a planning prompt: a simple, predictable plan
 * built from the roster in the prompt. Used so the whole flow can be tried for free.
 */
export function practicePlan(prompt: string): Plan {
  const request = block(prompt, "request").join(" ").trim();
  const rows: Row[] = block(prompt, "team").map((l) => {
    const [id = "", name = "", role = ""] = l.split(" | ");
    return { id: id.trim(), name: name.trim(), role: role.trim() };
  });
  const workflows = block(prompt, "workflows").map((l) => {
    const [id = "", name = ""] = l.split(" | ");
    return { id: id.trim(), name: name.trim() };
  });
  const squads = block(prompt, "squads").map((l) => {
    const [id = "", name = ""] = l.split(" | ");
    return { id: id.trim(), name: name.trim() };
  });
  const lower = request.toLowerCase();
  const practice = "Practice run: no credit is spent.";

  const wf = workflows.find((w) => w.name && lower.includes(w.name.toLowerCase()));
  if (wf) return { reply: `I'll run the saved workflow "${wf.name}" for this.`, assumptions: [practice], workflow: wf.id, steps: [] };

  if (/^(hi|hello|hey|thanks|thank you)\b/.test(lower) || !rows.length) {
    return { reply: rows.length ? "Hi! Tell me what you need and I'll plan it with the team." : "There's nobody on the team yet. Add agents in Settings, then ask again.", assumptions: [], steps: [] };
  }

  const isReviewer = (r: Row) => /review|qa|editor|check|quality/i.test(r.role);
  const reviewer = rows.find(isReviewer);
  const workers = rows.filter((r) => r !== reviewer);
  const squad = squads.find((q) => q.name && lower.includes(q.name.toLowerCase()));
  const short = request.length > 90 ? `${request.slice(0, 90)}…` : request;

  const steps: PlanStep[] = [];
  const first = squad ? { id: squad.id, name: squad.name, role: "squad" } : workers[0] ?? reviewer!;
  steps.push({
    who: squad ? squad.id : first.id,
    title: squad ? `${squad.name}: first pass` : `${first.role}: first pass`,
    what: `Work on this request from a ${squad ? "squad" : first.role.toLowerCase()}'s point of view and return a short result: ${short}`,
    needsApproval: false,
  });
  const second = workers.find((w) => w !== first);
  if (second) {
    steps.push({
      who: second.id,
      title: `${second.role}: build on step 1`,
      what: `Using step 1's result, finish the work for: ${short}`,
      after: [1],
      needsApproval: false,
      ...(reviewer ? { reviewBy: reviewer.id } : {}),
    });
  } else if (reviewer && reviewer !== first) {
    steps[0] = { ...steps[0]!, reviewBy: reviewer.id };
  }
  const who = (s: PlanStep) => (s.who.startsWith("squad:") ? squad?.name : rows.find((r) => r.id === s.who)?.name) ?? s.who;
  const reply = [
    `Here's my plan: ${who(steps[0]!)} starts`,
    steps[1] ? `, then ${who(steps[1])} builds on it after step 1${steps[1].reviewBy ? ` and ${rows.find((r) => r.id === steps[1]!.reviewBy)?.name} checks it` : ""}` : steps[0]!.reviewBy ? `, and ${rows.find((r) => r.id === steps[0]!.reviewBy)?.name} checks it` : "",
    ". I'll combine the results into one reply.",
  ].join("");
  return { reply, assumptions: [practice, "Short results, one round of review."], steps };
}

/** The practice runtime's combined reply: the first line of each part. */
export function practiceCombine(prompt: string): string {
  const body = prompt.split("\nSay what was done")[0] ?? prompt;
  const parts = body.split(/^### /m).slice(1);
  const lines = parts.map((part) => {
    const [title = "", ...rest] = part.split("\n");
    const first = rest
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && !/^_?mock output|^task:|^goal:|^verdict:/i.test(l))
      .map((l) => l.replace(/^[>*_\-\s]+|[_*]+$/g, "").trim())
      .find(Boolean);
    return `- **${title.trim()}:** ${first ?? "done"}`;
  });
  return ["Here's what the team came up with:", "", ...lines, "", "Next: look over the results, or ask me for changes. (Practice run, no credit spent.)"].join("\n");
}

/** The practice runtime's answer in a direct chat with a sub-agent. */
export function practiceChat(prompt: string, name: string, role: string): string {
  const q = /<question>\n([\s\S]*?)\n<\/question>/.exec(prompt)?.[1]?.trim() ?? "";
  return `I'm ${name}, the team's ${role.toLowerCase()}. About "${q.slice(0, 120)}": I'd start with the basics and keep it short. If you want me to actually do it, use Request work and the main agent will plan it. (Practice reply.)`;
}

/** Prompt for a direct question to a sub-agent. */
export function chatPrompt(question: string, history: Array<{ from: string; text: string }> = []): string {
  return [
    CHAT_MARKER,
    "Answer the person's question briefly, in plain words. Don't start any work; if they want work done, suggest they use Request work.",
    ...(history.length ? ["<chat>", ...history.slice(-6).map((m) => `${m.from}: ${line(m.text, 400)}`), "</chat>"] : []),
    "<question>",
    line(question, 2000),
    "</question>",
  ].join("\n");
}

/** A plan as a runnable step-list workflow (not saved unless the person saves it). */
export function planWorkflow(opts: { id: string; name: string; team: Team; request: string; steps: SimpleStep[]; costCapUsd?: number }): Workflow {
  return syncSimpleWorkflow(
    parseWorkflow({
      schemaVersion: 1,
      id: opts.id,
      name: opts.name,
      description: line(opts.request, 300),
      teamId: opts.team.id,
      inputs: [{ key: "goal", label: "Request", type: "longtext", required: true }],
      nodes: [],
      edges: [],
      simple: { steps: opts.steps },
      ...(opts.costCapUsd !== undefined ? { settings: { costCapUsd: opts.costCapUsd, handoffMaxChars: 4000 } } : {}),
    }),
  );
}

/** One step by one agent with a fixed prompt: how the main agent plans and how a sub-agent answers a chat. */
export function singleStepWorkflow(opts: { id: string; name: string; teamId: string; agentId: string; label: string; prompt: string }): Workflow {
  return parseWorkflow({
    schemaVersion: 1,
    id: opts.id,
    name: opts.name,
    teamId: opts.teamId,
    inputs: [],
    nodes: [
      { id: "answer", type: "agentTask", label: opts.label, position: { x: 260, y: 0 }, config: { agentId: opts.agentId, prompt: opts.prompt, requires: [] } },
      { id: "end", type: "end", label: "Done", position: { x: 260, y: 130 } },
    ],
    edges: [{ id: "e1", source: "answer", target: "end", condition: { type: "always" } }],
  });
}
