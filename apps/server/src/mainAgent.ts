import {
  PlanError,
  chatPrompt,
  mainAgentOf,
  parsePlan,
  planToSteps,
  planWorkflow,
  plannerPrompt,
  reduceRunState,
  singleStepWorkflow,
  subAgents,
  type RunState,
  type Team,
  type Workflow,
} from "@agent-town/core";
import type { PlanRow, RunPurpose, Store } from "./store";

/**
 * The main agent of each workspace: chat → plan → run → combined reply.
 *
 * Planning, chatting and the work itself are ordinary runs on the existing engine
 * (a one-step workflow for planning and chat, a step-list workflow for the plan),
 * so events, the office, approvals, cost caps and replay all work unchanged.
 */

export interface LaunchOptions {
  wf: Workflow;
  team: Team;
  inputs: Record<string, string>;
  purpose: RunPurpose;
  /** Who asked (hosted access), for budgets and the audit trail. */
  me: { email: string; role: string; local: boolean; dailyBudgetUsd?: number; scope?: Record<string, { role: string; dailyBudgetUsd?: number }> };
}

export interface MainAgentDeps {
  store: Store;
  /** Start a run with the same checks as POST /api/runs (budget, preflight). Returns the run id. */
  launch: (o: LaunchOptions) => Promise<string>;
  stop: (runId: string, reason: string) => Promise<void>;
  liveState: (runId: string) => RunState | undefined;
  /** Who someone is now (for auto-run on their behalf); undefined = this computer's owner. */
  meFor: (email?: string) => LaunchOptions["me"];
}

export class UserError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface PlanView extends PlanRow {
  /** The plan's steps with their live status, for the Tasks tab and the "working on" bar. */
  steps: Array<{ id: string; title: string; who: string; after?: number[]; status: string; needsApproval?: boolean }>;
  done: number;
  total: number;
  costUsd?: number;
}

export function createMainAgent(deps: MainAgentDeps) {
  const { store } = deps;

  const mustTeam = (id: string) => {
    const t = store.getTeam(id);
    if (!t) throw new UserError(404, "Workspace not found");
    return t;
  };
  const savedWorkflows = (teamId: string) => store.listWorkflows().filter((w) => w.teamId === teamId);

  /** A person writes to the main agent: store the message and start planning. */
  async function ask(teamId: string, text: string, me: LaunchOptions["me"]) {
    const team = mustTeam(teamId);
    const main = mainAgentOf(team);
    if (!main) throw new UserError(409, "This workspace has no main agent");
    const request = text.trim().slice(0, 4000);
    if (!request) throw new UserError(400, "Say what you need");
    if (store.listPlans(teamId, 5).some((p) => p.status === "planning")) throw new UserError(409, "Still working on your last message");
    const history = store.messages(teamId, main.id, 12).map((m) => ({ from: m.role === "person" ? "Person" : main.name, text: m.text }));
    const plan = store.createPlan({ id: crypto.randomUUID(), teamId, request, startedBy: me.local ? undefined : me.email });
    const message = store.addMessage({ teamId, agentId: main.id, role: "person", text: request, planId: plan.id, author: me.local ? undefined : me.email });
    const wf = singleStepWorkflow({
      id: `plan-${plan.id.slice(0, 8)}-planning`,
      name: `Planning #${plan.number}`,
      teamId,
      agentId: main.id,
      label: "Make a plan",
      prompt: plannerPrompt({ request, team, workflows: savedWorkflows(teamId).map((w) => ({ id: w.id, name: w.name, description: w.description })), history }),
    });
    try {
      const runId = await deps.launch({ wf, team, inputs: {}, purpose: "plan", me });
      store.updatePlan(plan.id, { planningRunId: runId });
    } catch (e) {
      store.updatePlan(plan.id, { status: "error", error: (e as Error).message });
      store.addMessage({ teamId, agentId: main.id, role: "agent", text: `I couldn't start planning: ${(e as Error).message}`, planId: plan.id });
    }
    return { message, plan: store.getPlan(plan.id)! };
  }

  /** A person asks a sub-agent a question directly (no work is started). */
  async function chat(teamId: string, agentId: string, text: string, me: LaunchOptions["me"]) {
    const team = mustTeam(teamId);
    const agent = subAgents(team).find((a) => a.id === agentId);
    if (!agent) throw new UserError(404, "That agent isn't on this team");
    const question = text.trim().slice(0, 4000);
    if (!question) throw new UserError(400, "Ask something");
    const history = store.messages(teamId, agentId, 12).map((m) => ({ from: m.role === "person" ? "Person" : agent.name, text: m.text }));
    const wf = singleStepWorkflow({ id: `chat-${agent.id}`.slice(0, 80), name: `Chat with ${agent.name}`, teamId, agentId, label: "Answer", prompt: chatPrompt(question, history) });
    const runId = await deps.launch({ wf, team, inputs: {}, purpose: "chat", me });
    return store.addMessage({ teamId, agentId, role: "person", text: question, runId, author: me.local ? undefined : me.email });
  }

  async function runPlan(planId: string, me: LaunchOptions["me"]) {
    const p = store.getPlan(planId);
    if (!p) throw new UserError(404, "Plan not found");
    if (p.status !== "proposed") throw new UserError(409, "This plan isn't waiting to run");
    const team = mustTeam(p.teamId);
    let wf: Workflow;
    let inputs: Record<string, string>;
    if (p.plan?.workflow) {
      wf = store.getWorkflow(p.plan.workflow) ?? (() => { throw new UserError(409, "That workflow was deleted"); })();
      const key = wf.inputs.find((i) => i.type === "longtext")?.key ?? wf.inputs[0]?.key;
      inputs = { ...Object.fromEntries(wf.inputs.map((i) => [i.key, i.default ?? ""])), ...(key ? { [key]: p.request } : {}) };
    } else {
      wf = planWorkflow({ id: `plan-${p.id.slice(0, 8)}`, name: `Plan #${p.number}: ${shortTitle(p.request)}`, team, request: p.request, steps: planToSteps(p.plan!, team, p.request) });
      inputs = { goal: p.request };
    }
    store.updatePlan(planId, { status: "running" });
    try {
      const runId = await deps.launch({ wf, team, inputs, purpose: "work", me });
      return store.updatePlan(planId, { runId })!;
    } catch (e) {
      store.updatePlan(planId, { status: "proposed" });
      throw e;
    }
  }

  async function cancel(planId: string) {
    const p = store.getPlan(planId);
    if (!p) throw new UserError(404, "Plan not found");
    if (p.status === "proposed" || p.status === "planning") {
      if (p.planningRunId && deps.liveState(p.planningRunId)) await deps.stop(p.planningRunId, "Plan cancelled");
      return store.updatePlan(planId, { status: "cancelled" })!;
    }
    if (p.status === "running" && p.runId) {
      await deps.stop(p.runId, "Plan cancelled");
      return store.getPlan(planId)!;
    }
    throw new UserError(409, "This plan has already finished");
  }

  /** Called for every run that ends. */
  async function onRunEnded(runId: string) {
    const row = store.getRunRow(runId);
    if (!row) return;
    const state = reduceRunState(store.events(runId));
    if (row.purpose === "chat") {
      const q = store.messages(row.teamId, findChatAgent(runId), 50).find((m) => m.runId === runId);
      if (!q) return;
      const answer = state.nodes["answer"]?.output;
      store.addMessage({ teamId: row.teamId, agentId: q.agentId, role: "agent", text: answer ?? `I couldn't answer: ${state.error ?? state.endReason ?? row.status}`, runId });
      return;
    }
    const plan = store.planByRun(runId);
    if (!plan) return;
    const team = store.getTeam(plan.teamId);
    const main = team && mainAgentOf(team);
    if (!team || !main) return;
    const say = (text: string) => store.addMessage({ teamId: team.id, agentId: main.id, role: "agent", text, planId: plan.id, runId });

    if (row.purpose === "plan") {
      if (plan.status !== "planning") return;
      const answer = state.nodes["answer"]?.output;
      if (state.status !== "completed" || !answer) {
        store.updatePlan(plan.id, { status: "error", error: state.error ?? state.endReason ?? "Planning stopped" });
        say(`I couldn't make a plan: ${state.error ?? state.endReason ?? "planning stopped"}`);
        return;
      }
      try {
        const parsed = parsePlan(answer, team, savedWorkflows(team.id).map((w) => w.id));
        if (!parsed.workflow && !parsed.steps.length) {
          store.updatePlan(plan.id, { status: "answered", plan: parsed, reply: parsed.reply });
          say(parsed.reply || "Done.");
          return;
        }
        store.updatePlan(plan.id, { status: "proposed", plan: parsed });
        say(parsed.reply || "Here's my plan.");
        // Auto-run: only when the workspace allows it and has a cost cap (send and spend still ask).
        if (team.autoRun && team.defaults.costCapUsd > 0) {
          await runPlan(plan.id, deps.meFor(plan.startedBy)).catch((e) =>
            say(`I didn't start it automatically: ${(e as Error).message}`),
          );
        }
      } catch (e) {
        const msg = e instanceof PlanError ? e.message : (e as Error).message;
        store.updatePlan(plan.id, { status: "error", error: msg });
        say(`${answer.split("```")[0]!.trim().slice(0, 1500)}\n\n(${msg}, so there's nothing to run. Try asking again in other words.)`.trim());
      }
      return;
    }

    // The plan's own run ended.
    if (plan.runId !== runId) return;
    const status = state.status === "completed" ? "done" : state.status === "stopped" ? "cancelled" : "failed";
    const reply = state.nodes["s-combine"]?.output ?? lastOutput(state);
    store.updatePlan(plan.id, { status, reply });
    if (status === "done") say(reply ?? "Done.");
    else if (status === "cancelled") say(`Plan #${plan.number} was stopped${state.endReason ? `: ${state.endReason}` : ""}.`);
    else say(`Plan #${plan.number} failed: ${state.error ?? "unknown error"}. Open the run to see where.`);
  }

  /** Chat runs are named after the agent; find whose thread asked it. */
  function findChatAgent(runId: string): string {
    const run = store.getRun(runId);
    const node = run?.workflow.nodes.find((n) => n.id === "answer");
    return ((node?.config as { agentId?: string }) ?? {}).agentId ?? "";
  }

  function view(p: PlanRow): PlanView {
    const team = store.getTeam(p.teamId);
    const st = p.runId ? (deps.liveState(p.runId) ?? reduceRunState(store.events(p.runId))) : undefined;
    let steps: PlanView["steps"] = [];
    if (p.plan?.workflow) {
      const wf = store.getWorkflow(p.plan.workflow);
      steps = (wf?.nodes ?? []).filter((n) => n.type === "agentTask").map((n) => ({ id: n.id, title: n.label || n.id, who: String((n.config as { agentId?: string }).agentId ?? ""), status: st?.nodes[n.id]?.status ?? "idle" }));
    } else if (p.plan && team) {
      steps = planToSteps(p.plan, team, p.request).map((s) => ({
        id: s.id,
        title: s.title,
        who: s.who,
        status: st?.nodes[`s-${s.id}`]?.status ?? "idle",
        needsApproval: s.needsApproval,
      }));
    }
    const run = p.runId ? store.getRunRow(p.runId) : undefined;
    return { ...p, steps, done: steps.filter((s) => s.status === "done").length, total: steps.length, costUsd: run?.costUsd };
  }

  /** Keep a plan as a workflow, so it can be run again in one click (and the main agent can reuse it). */
  function save(planId: string, newId: (base: string) => string) {
    const p = store.getPlan(planId);
    if (!p?.plan) throw new UserError(404, "Plan not found");
    if (p.workflowId && store.getWorkflow(p.workflowId)) return store.getWorkflow(p.workflowId)!;
    if (p.plan.workflow) throw new UserError(409, "This plan already uses a saved workflow");
    const team = mustTeam(p.teamId);
    const name = shortTitle(p.request);
    const wf = store.saveWorkflow({
      ...planWorkflow({ id: newId(name), name, team, request: p.request, steps: planToSteps(p.plan, team, p.request) }),
      inputs: [{ key: "goal", label: "Request", type: "longtext", required: true, default: p.request }],
      description: `Saved from plan #${p.number}`,
    });
    store.updatePlan(planId, { workflowId: wf.id });
    return wf;
  }

  return {
    ask,
    save,
    chat,
    runPlan,
    cancel,
    onRunEnded,
    plans: (teamId: string) => store.listPlans(teamId).map(view),
    plan: (id: string) => {
      const p = store.getPlan(id);
      return p ? view(p) : undefined;
    },
    /** Plans waiting for Run plan, for the Inbox. */
    inboxItems: () =>
      store
        .listPlans(undefined, 100)
        .filter((p) => p.status === "proposed")
        .map((p) => ({ id: `plan:${p.id}`, kind: "plan", teamId: p.teamId, title: `Plan #${p.number} is ready to run`, detail: shortTitle(p.request), planId: p.id, at: p.updatedAt })),
  };
}

function lastOutput(state: RunState): string | undefined {
  const done = Object.values(state.nodes).filter((n) => n.status === "done" && n.output);
  return done.at(-1)?.output;
}

function shortTitle(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 60)}…` : one;
}
