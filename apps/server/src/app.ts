import type { IncomingMessage, ServerResponse } from "node:http";
import { ZodError } from "zod";
import {
  Team,
  parseWorkflow,
  reduceRunState,
  starterTemplates,
  blankWorkflow,
  validateWorkflowGraph,
  importAgentFactoryTemplate,
  remapWorkflowAgents,
  syncSimpleWorkflow,
  AgentTemplate,
  Skill,
  starterSkills,
  type AgentFactoryFiles,
  type AgentTownEvent,
  type Workflow,
} from "@agent-town/core";
import {
  ConnectorRegistry,
  MockAdapter,
  MockChatConnector,
  MockWebConnector,
  PreflightError,
  RuntimeAdapterRegistry,
  VaultConnector,
  WorkflowEngine,
  type Run,
} from "@agent-town/core/engine";
import { Store } from "./store";
import { DiskVault } from "./vault";
import { OpenCodeAdapter, type OpenCodeAdapterOptions } from "@agent-town/adapter-opencode";
import { applyAssignment, fetchGithubSkill, isAssigned, isChoices, skillFromFiles, slugify } from "./skills";
import { AccessVerifier, AuthError, RateLimiter, ROLES, can, type Permission, type Role } from "./auth";

export interface AppOptions {
  dbFile: string;
  vaultDir: string;
  /** Delay between mock runtime events (ms). */
  mockStepMs?: number;
  seedTemplates?: boolean;
  /** Register the OpenCode runtime (only when the user configured it). */
  opencode?: OpenCodeAdapterOptions;
  /** Hosted access (docs/hosting.md): enables handleTunnel. */
  access?: {
    verifier: Pick<AccessVerifier, "verify">;
    /** The owner's email (full rights, can't be removed). */
    ownerEmail: string;
    /** Public origin, e.g. https://agents.devsam.my (mutating requests must come from it). */
    publicOrigin: string;
  };
}

/** Who is making a request. Local requests (the PC itself, port 4317) act as the owner. */
export interface Me {
  email: string;
  role: Role;
  local: boolean;
  dailyBudgetUsd?: number;
}

class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown, me: Me) => Promise<unknown> | unknown;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
const newId = (base: string) => `${slug(base)}-${Math.random().toString(36).slice(2, 7)}`;

export function createApp(opts: AppOptions) {
  const store = new Store(opts.dbFile);
  const vault = new DiskVault(opts.vaultDir, (runId) => store.runVaultDir(runId));

  // Layer 1: runtime adapters. Milestone 2 registers OpenCode here; M3 Claude Code.
  const adapters = new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: opts.mockStepMs ?? 350 }));
  // OpenCode is opt-in: registered only when its URL is configured (it spends real credit).
  if (opts.opencode) adapters.register(new OpenCodeAdapter(opts.opencode));
  // Layer 3: connectors. Milestone 2 adds generic MCP + self-hosted OpenConnector here.
  const connectors = new ConnectorRegistry()
    .register(new VaultConnector(vault))
    .register(new MockChatConnector(vault))
    .register(new MockWebConnector());

  const sse = new Map<string, Set<ServerResponse>>();
  const engine = new WorkflowEngine({
    adapters,
    connectors,
    vault,
    onEvent: (ev: AgentTownEvent) => {
      store.appendEvent(ev);
      for (const res of sse.get(ev.runId) ?? []) res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
      if (ev.type === "run.completed" || ev.type === "run.failed" || ev.type === "run.stopped") void writeRunSummary(ev.runId).catch(() => undefined);
    },
  });

  /** `_run.md` in the run folder: a metadata header like AI Agent Office's reports, plus the step table. */
  async function writeRunSummary(runId: string) {
    const run = store.getRun(runId);
    if (!run) return;
    const steps = store.stepRuns(runId);
    const files = (await vault.listFiles(runId)).filter((f) => f !== "_run.md");
    const agentName = (id: unknown) => run.team.agents.find((a) => a.id === id)?.name ?? String(id ?? "-");
    const lines = [
      "---",
      `run: ${run.id}`,
      `workflow: ${JSON.stringify(run.workflowName)} (rev ${run.workflow.revision})`,
      `team: ${JSON.stringify(run.team.name)}`,
      `status: ${run.status}`,
      `started: ${run.createdAt}`,
      `ended: ${run.endedAt ?? ""}`,
      `cost_usd: ${run.costUsd}`,
      "---",
      "",
      `# ${run.workflowName}`,
      "",
      ...Object.entries(run.inputs).map(([k, v]) => `**${k}:** ${v}`),
      "",
      "## Steps",
      "",
      "| Step | Attempt | Agent | Runtime / model | Status | Duration | Tokens | Cost |",
      "|---|---|---|---|---|---|---|---|",
      ...steps.map(
        (r) =>
          `| ${r.node_id} | ${r.attempt} | ${agentName(r.agent_id)} | ${r.runtime ?? "-"}${r.model ? ` / ${r.model}` : ""} | ${r.status} | ${r.duration_ms ?? "-"} ms | ${r.tokens} | $${Number(r.cost_usd).toFixed(5)} |`,
      ),
      "",
      "## Files",
      "",
      ...files.map((f) => `- [${f}](${encodeURI(f)})`),
      "",
    ];
    await vault.writeFile(runId, "_run.md", lines.join("\n"));
  }

  // Runs interrupted by a restart can't resume their in-memory state: close them honestly.
  for (const o of store.orphanedRuns()) {
    store.appendEvent({ seq: o.lastSeq + 1, runId: o.id, ts: new Date().toISOString(), type: "run.stopped", reason: "Server restarted while the run was active" });
  }

  // Databases from before the shared agent library: move embedded agents into it.
  store.migrateLegacyTeams();
  store.assignMissingCharacters();

  if (opts.seedTemplates !== false && store.listTeams().length === 0) {
    for (const t of starterTemplates()) {
      store.saveTeam(t.team);
      store.saveWorkflow(t.workflow);
    }
  }

  const routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler; need: Permission }> = [];
  /** Reading needs "view", changing needs "edit" unless a route says otherwise (see auth.ts). */
  const route = (method: string, path: string, handler: Handler, need: Permission = method === "GET" ? "view" : "edit") => {
    const keys: string[] = [];
    const pattern = new RegExp(
      "^" + path.replace(/:(\w+)(\*)?/g, (_m, k: string, star?: string) => (keys.push(k), star ? "(.+)" : "([^/]+)")) + "$",
    );
    routes.push({ method, pattern, keys, handler, need });
  };
  const localOwner: Me = { email: opts.access?.ownerEmail ?? "", role: "owner", local: true };
  const actorOf = (me: Me) => (me.local ? undefined : me.email);

  /** Does starting this workflow spend real credit (any agent on a runtime that spends)? */
  const spendsCredit = (team: Team) =>
    team.agents.some((a) => adapters.get(a.runtime ?? team.defaults.runtime)?.manifest.spendsCredit);

  const liveRun = (id: string): Run => {
    const run = engine.get(id);
    if (!run || run.isTerminal()) throw new HttpError(409, "Run is not active");
    return run;
  };
  const mustTeam = (id: string) => store.getTeam(id) ?? fail(404, `Team ${id} not found`);
  const mustWorkflow = (id: string) => store.getWorkflow(id) ?? fail(404, `Workflow ${id} not found`);

  // --- meta ------------------------------------------------------------------
  route("GET", "/api/health", () => ({ ok: true, version: "0.3.0" }));
  route("GET", "/api/runtimes", async () =>
    Promise.all(
      adapters.manifests().map(async (m) => ({ ...m, models: await adapters.require(m.id).listModels().catch(() => []) })),
    ),
  );
  route("GET", "/api/connectors", async () => ({ connectors: connectors.manifests(), tools: await connectors.listAllTools() }));
  route("GET", "/api/templates", () => starterTemplates().map((t) => ({ id: t.id, name: t.name, description: t.description, teamName: t.team.name })));
  route("POST", "/api/templates/:id/instantiate", (_q, _r, p) => {
    const t = starterTemplates().find((x) => x.id === p.id) ?? fail(404, "No such template");
    const teamId = newId(t.team.name);
    const suffix = teamId.split("-").pop()!;
    const rename = new Map<string, string>();
    for (const a of t.team.agents) {
      const id = `${a.id}-${suffix}`;
      rename.set(a.id, id);
      store.saveAgent({ ...a, id });
    }
    const team = store.saveTeam(Team.parse({ ...t.team, id: teamId, name: `${t.team.name} (copy)`, vault: teamId, agents: [], memberIds: [...rename.values()] }));
    const wf = store.saveWorkflow(
      remapWorkflowAgents({ ...t.workflow, id: newId(t.workflow.name), name: `${t.workflow.name} (copy)`, teamId: team.id, revision: 1 }, rename),
    );
    return { team, workflow: wf };
  });

  // --- agents (shared library) ---------------------------------------------
  const mustAgent = (id: string) => store.getAgent(id) ?? fail(404, `Agent ${id} not found`);
  const agentUsage = (id: string) => ({
    teams: store.listTeamsRaw().filter((t) => t.memberIds.includes(id)).map((t) => ({ id: t.id, name: t.name })),
    workflows: store
      .listWorkflows()
      .filter((w) => w.nodes.some((n) => (n.config as { agentId?: string }).agentId === id))
      .map((w) => ({ id: w.id, name: w.name })),
  });
  route("GET", "/api/agents", () => {
    const teams = store.listTeamsRaw();
    return store.listAgents().map((a) => ({ ...a, teams: teams.filter((t) => t.memberIds.includes(a.id)).map((t) => ({ id: t.id, name: t.name })) }));
  });
  route("GET", "/api/agents/:id", (_q, _r, p) => ({ agent: mustAgent(p.id!), ...agentUsage(p.id!) }));
  route("POST", "/api/agents", (_q, _r, _p, body) => {
    const b = (body ?? {}) as { name?: string; teamId?: string } & Record<string, unknown>;
    const name = (b.name ?? "").trim() || "New agent";
    let id = String(b.id ?? "") || newId(name);
    if (store.getAgent(id)) id = newId(name);
    const agent = store.saveAgent(AgentTemplate.parse({ role: name, ...b, id, name }));
    if (b.teamId) {
      const team = mustTeam(b.teamId);
      store.saveTeam(Team.parse({ ...team, memberIds: [...team.memberIds, agent.id] }));
    }
    return agent;
  });
  route("PUT", "/api/agents/:id", (_q, _r, p, body) => {
    mustAgent(p.id!);
    return store.saveAgent(AgentTemplate.parse({ ...(body as object), id: p.id }));
  });
  route("POST", "/api/agents/:id/clone", (_q, _r, p) => {
    const src = mustAgent(p.id!);
    return store.saveAgent({ ...src, id: newId(src.name), name: `${src.name} (copy)` });
  });
  route("DELETE", "/api/agents/:id", (_q, _r, p) => {
    mustAgent(p.id!);
    const usage = agentUsage(p.id!);
    if (usage.workflows.length) fail(409, `Used by ${usage.workflows.length} workflow(s) — reassign those steps first`, usage);
    store.deleteAgent(p.id!);
    return { deleted: p.id };
  });
  /** "Now" and "Recent work" for an agent's page, from the step_runs table. */
  route("GET", "/api/agents/:id/activity", (_q, _r, p) => {
    mustAgent(p.id!);
    const rows = store.agentStepRuns(p.id!, 30);
    return {
      now: rows.filter((r) => r.status === "running"),
      recent: rows.filter((r) => r.status !== "running"),
    };
  });

  // --- skills (shared library) ----------------------------------------------
  const mustSkill = (id: string) => store.getSkill(id) ?? fail(404, `Skill ${id} not found`);
  const uniqueSkillId = (base: string) => {
    let id = slugify(base);
    for (let i = 2; store.getSkill(id); i++) id = `${slugify(base)}-${i}`;
    return id;
  };
  /** Save a new skill and apply who gets it: `scope` + `agentIds` (agents scope) or `offFor` (global). */
  const createSkill = (raw: unknown, scope?: "global" | "agents", agentIds: string[] = []) => {
    const r = (raw ?? {}) as { id?: string; name?: string };
    const parsed = Skill.parse({ ...r, id: r.id || slugify(r.name || "skill") });
    const skill = store.saveSkill({ ...parsed, id: uniqueSkillId(parsed.id || parsed.name), scope: scope ?? parsed.scope });
    if (skill.scope === "agents") for (const id of agentIds) {
      const a = store.getAgent(id);
      if (a) store.saveAgent(applyAssignment(a, skill, true));
    }
    return skill;
  };
  const skillAgents = (skill: Skill) => store.listAgents().map((a) => ({ id: a.id, name: a.name, role: a.role, color: a.appearance.color, sprite: a.appearance.sprite, on: isAssigned(a, skill) }));

  route("GET", "/api/skills", () => store.listSkills());
  route("GET", "/api/skills/:id", (_q, _r, p) => {
    const skill = mustSkill(p.id!);
    return { skill, agents: skillAgents(skill) };
  });
  route("POST", "/api/skills", (_q, _r, _p, body) => {
    const b = (body ?? {}) as { skill?: unknown; scope?: "global" | "agents"; agentIds?: string[] };
    return createSkill({ source: "manual", ...(b.skill as object) }, b.scope, b.agentIds);
  });
  /** Folder import: one or more skill folders, each `{ files: { "SKILL.md": "...", "templates/x.md": "..." } }`. */
  route("POST", "/api/skills/import", (_q, _r, _p, body) => {
    const b = (body ?? {}) as { folders?: Array<{ name?: string; files: Record<string, string> }>; scope?: "global" | "agents"; agentIds?: string[] };
    if (!b.folders?.length) fail(400, "No skill folders in the request");
    const created: Skill[] = [];
    const warnings: string[] = [];
    for (const folder of b.folders!) {
      const { skill, warnings: w } = skillFromFiles(folder.files, "folder", folder.name);
      created.push(createSkill(skill, b.scope, b.agentIds));
      warnings.push(...w.map((x) => `${skill.name}: ${x}`));
    }
    return { created, warnings };
  });
  route("GET", "/api/skill-starters", () => {
    const installed = new Set(store.listSkills().filter((s) => s.source === "starter").map((s) => s.name));
    return starterSkills().map((s) => ({ ...s, installed: installed.has(s.name) }));
  });
  route("POST", "/api/skill-starters/:id/install", (_q, _r, p, body) => {
    const starter = starterSkills().find((s) => s.id === p.id) ?? fail(404, "No such starter skill");
    const b = (body ?? {}) as { scope?: "global" | "agents"; agentIds?: string[] };
    return createSkill(starter, b.scope, b.agentIds);
  });
  /** GitHub install, step 1: download at an exact commit and show it — nothing is saved. */
  route("POST", "/api/skills/github/preview", async (_q, _r, _p, body) => {
    const url = ((body ?? {}) as { url?: string }).url;
    if (!url) fail(400, "url is required");
    return fetchGithubSkill(url!);
  });
  /** GitHub install, step 2 is POST /api/skills with the previewed skill (source "github", origin pinned). */
  route("POST", "/api/skills/:id/check-source", async (_q, _r, p) => {
    const skill = mustSkill(p.id!);
    if (!skill.origin) fail(400, "This skill was not installed from GitHub");
    const o = skill.origin!;
    const latest = await fetchGithubSkill(`https://github.com/${o.repo}/tree/${o.ref}${o.path ? `/${o.path}` : ""}`);
    if (isChoices(latest)) fail(409, "The skill folder moved upstream — reinstall it from its new location");
    return { ...latest, changed: latest.skill.origin?.commit !== o.commit, current: o.commit };
  });
  route("PUT", "/api/skills/:id", (_q, _r, p, body) => {
    const existing = mustSkill(p.id!);
    const b = (body ?? {}) as { skill?: unknown; assign?: Record<string, boolean> };
    const skill = store.saveSkill(Skill.parse({ ...existing, ...(b.skill as object), id: existing.id, createdAt: existing.createdAt }));
    // Changing scope resets per-agent refs to the new meaning.
    if (skill.scope !== existing.scope) {
      for (const a of store.listAgents()) if (a.skills.some((r) => r.skillId === skill.id)) store.saveAgent({ ...a, skills: a.skills.filter((r) => r.skillId !== skill.id) });
    }
    for (const [agentId, on] of Object.entries(b.assign ?? {})) {
      const a = store.getAgent(agentId);
      if (a) store.saveAgent(applyAssignment(a, skill, on));
    }
    return { skill, agents: skillAgents(skill) };
  });
  route("DELETE", "/api/skills/:id", (_q, _r, p) => {
    mustSkill(p.id!);
    store.deleteSkill(p.id!);
    return { deleted: p.id };
  });

  // --- teams -----------------------------------------------------------------
  route("GET", "/api/teams", () => store.listTeams());
  route("GET", "/api/teams/:id", (_q, _r, p) => mustTeam(p.id!));
  route("POST", "/api/teams", (_q, _r, _p, body) => {
    const input = (body ?? {}) as { id?: string; name?: string };
    const team = Team.parse({ ...input, id: input.id || newId(input.name || "team"), name: input.name || "New team" });
    if (store.getTeam(team.id)) fail(409, `Team ${team.id} already exists`);
    return store.saveTeam(team);
  });
  route("PUT", "/api/teams/:id", (_q, _r, p, body) => {
    mustTeam(p.id!);
    const team = Team.parse({ ...(body as object), id: p.id });
    const ids = team.memberIds.length ? team.memberIds : team.agents.map((a) => a.id);
    if (new Set(ids).size !== ids.length) fail(400, "An agent can only be in a team once");
    for (const id of team.memberIds) if (!store.getAgent(id)) fail(400, `Unknown agent "${id}"`);
    return store.saveTeam(team);
  });
  route("POST", "/api/teams/:id/clone", (_q, _r, p) => {
    const src = mustTeam(p.id!);
    const id = newId(src.name);
    return store.saveTeam({ ...src, id, name: `${src.name} (copy)`, vault: id, createdAt: undefined });
  });
  /** Import one or more Agent Factory role-template folders into a team (format only; see core/importers). */
  route("POST", "/api/teams/:id/import/agent-factory", async (_q, _r, p, body) => {
    const team = mustTeam(p.id!);
    const templates = ((body ?? {}) as { templates?: AgentFactoryFiles[] }).templates ?? [];
    if (!templates.length) fail(400, "No templates in the request");
    const models = new Set<string>();
    for (const m of adapters.manifests()) for (const x of await adapters.require(m.id).listModels().catch(() => [])) models.add(x.id);
    const palette = ["#2a9d8f", "#e76f51", "#4f86f7", "#9b5de5", "#e9c46a", "#43aa8b", "#f15bb5", "#577590"];
    const imported: Array<{ id: string; name: string; notes: string[] }> = [];
    const memberIds = [...team.memberIds];
    for (const files of templates) {
      const { agent, notes } = importAgentFactoryTemplate(files, { knownModel: (id) => models.has(id), color: palette[memberIds.length % palette.length] });
      let id = agent.id;
      for (let i = 2; store.getAgent(id); i++) id = `${agent.id}-${i}`;
      store.saveAgent({ ...agent, id });
      memberIds.push(id);
      imported.push({ id, name: agent.name, notes });
    }
    return { team: store.saveTeam(Team.parse({ ...team, memberIds })), imported };
  });
  route("DELETE", "/api/teams/:id", (req, _r, p) => {
    mustTeam(p.id!);
    const used = store.workflowsForTeam(p.id!);
    const force = new URL(req.url!, "http://x").searchParams.get("force") === "1";
    if (used.length && !force) fail(409, `Team is used by ${used.length} workflow(s)`, { workflows: used });
    for (const w of used) store.deleteWorkflow(w);
    store.deleteTeam(p.id!);
    return { deleted: p.id, workflowsDeleted: used };
  });

  // --- workflows -------------------------------------------------------------
  route("GET", "/api/workflows", () => store.listWorkflows());
  route("GET", "/api/workflows/:id", (_q, _r, p) => {
    const wf = mustWorkflow(p.id!);
    return { workflow: wf, issues: validateWorkflowGraph(wf) };
  });
  route("POST", "/api/workflows", (_q, _r, _p, body) => {
    const b = (body ?? {}) as { name?: string; teamId?: string; mode?: "steps" | "graph" };
    if (!b.teamId) fail(400, "teamId is required");
    const team = mustTeam(b.teamId!);
    const blank = blankWorkflow(newId(b.name || "workflow"), b.teamId!, b.name || "Untitled workflow");
    if (b.mode === "graph") return store.saveWorkflow(blank);
    // Default: step-list mode with one step for the first member.
    const first = team.agents[0]?.id ?? "";
    return store.saveWorkflow(syncSimpleWorkflow({ ...blank, simple: { steps: [{ id: "step1", title: "First step", who: first, what: "", needsApproval: false, parallelWithPrevious: false }] } }));
  });
  route("PUT", "/api/workflows/:id", (_q, _r, p, body) => {
    const existing = mustWorkflow(p.id!);
    const wf = syncSimpleWorkflow(parseWorkflow({ ...(body as object), id: p.id, revision: existing.revision }));
    mustTeam(wf.teamId);
    const saved = store.saveWorkflow(wf);
    return { workflow: saved, issues: validateWorkflowGraph(saved) };
  });
  route("POST", "/api/workflows/:id/clone", (_q, _r, p) => {
    const src = mustWorkflow(p.id!);
    return store.saveWorkflow({ ...src, id: newId(src.name), name: `${src.name} (copy)`, revision: 1, createdAt: undefined });
  });
  route("DELETE", "/api/workflows/:id", (_q, _r, p) => {
    if (!store.deleteWorkflow(p.id!)) fail(404, "Workflow not found");
    return { deleted: p.id };
  });
  route("GET", "/api/workflows/:id/export", (_q, res, p) => {
    const wf = mustWorkflow(p.id!);
    res.setHeader("Content-Disposition", `attachment; filename="${wf.id}.workflow.json"`);
    return wf;
  });
  /** Import: body is workflow JSON. A new id is assigned if it clashes. teamId must exist (or pass ?teamId=). */
  route("POST", "/api/workflows/import", (req, _r, _p, body) => {
    const wf = syncSimpleWorkflow(parseWorkflow(body));
    const teamOverride = new URL(req.url!, "http://x").searchParams.get("teamId");
    const teamId = teamOverride || wf.teamId;
    if (!store.getTeam(teamId)) fail(400, `Team "${teamId}" does not exist — import or create it first, or choose a team`);
    const id = store.getWorkflow(wf.id) ? newId(wf.name) : wf.id;
    const saved = store.saveWorkflow({ ...wf, id, teamId, revision: 1 });
    return { workflow: saved, issues: validateWorkflowGraph(saved) };
  });
  route("POST", "/api/workflows/:id/preflight", async (_q, _r, p, body) => {
    const wf = mustWorkflow(p.id!);
    const team = mustTeam(wf.teamId);
    return engine.preflight(wf, team, ((body ?? {}) as { inputs?: Record<string, string> }).inputs ?? {});
  });

  // --- runs ------------------------------------------------------------------
  route("GET", "/api/runs", () => store.listRuns());
  route(
    "POST",
    "/api/runs",
    async (_q, _r, _p, body, me) => {
      const b = (body ?? {}) as { workflowId?: string; inputs?: Record<string, string>; force?: boolean };
      const wf: Workflow = mustWorkflow(b.workflowId ?? "");
      const team = mustTeam(wf.teamId);
      const inputs = { ...(b.inputs ?? {}) };
      // Operators spend the owner's credit only within their daily budget.
      let maxCostUsd: number | undefined;
      if (me.role === "operator" && spendsCredit(team)) {
        const left = (me.dailyBudgetUsd ?? 0) - store.spentToday(me.email);
        if (left <= 0) fail(403, "Your daily budget for real runs is used up — ask the owner to raise it");
        maxCostUsd = left;
      }
      const runId = crypto.randomUUID();
      const pf = await engine.preflight(wf, team, inputs);
      if (!pf.ok && !b.force) fail(422, "Preflight failed", pf);
      store.createRun(runId, wf, team, inputs);
      if (!me.local) store.setRunStartedBy(runId, me.email);
      await vault.ensureTeamVault(team.vault);
      store.setRunVaultDir(runId, DiskVault.runFolder(team.vault, wf.name, runId));
      await engine.start(wf, team, inputs, { runId, force: b.force, actor: actorOf(me), maxCostUsd });
      return { runId, preflight: pf };
    },
    "run",
  );
  route("GET", "/api/runs/:id", (_q, _r, p) => {
    const run = store.getRun(p.id!) ?? fail(404, "Run not found");
    const events = store.events(p.id!);
    return {
      run,
      events,
      state: reduceRunState(events),
      live: !!engine.get(p.id!) && !engine.get(p.id!)!.isTerminal(),
      vaultDir: store.runVaultDir(p.id!) ?? `runs/${p.id}`,
    };
  });
  route("GET", "/api/runs/:id/stream", (req, res, p) => {
    if (!store.getRun(p.id!)) fail(404, "Run not found");
    const last = Number(req.headers["last-event-id"] ?? new URL(req.url!, "http://x").searchParams.get("after") ?? 0) || 0;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.write(": connected\n\n");
    for (const ev of store.events(p.id!, last)) res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
    const set = sse.get(p.id!) ?? new Set();
    set.add(res);
    sse.set(p.id!, set);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      clearInterval(ping);
      set.delete(res);
    });
    return STREAMING;
  });
  route("POST", "/api/runs/:id/pause", (_q, _r, p, _b, me) => (liveRun(p.id!).pause(undefined, actorOf(me)), { ok: true }), "run");
  route("POST", "/api/runs/:id/resume", (_q, _r, p, _b, me) => (liveRun(p.id!).resume(actorOf(me)), { ok: true }), "run");
  route("POST", "/api/runs/:id/stop", async (_q, _r, p, _b, me) => (await liveRun(p.id!).stop(me.local ? undefined : `Stopped by ${me.email}`, actorOf(me)), { ok: true }), "run");
  route(
    "POST",
    "/api/runs/:id/approve",
    (_q, _r, p, body, me) => {
      const b = (body ?? {}) as { approvalId?: string; approved?: boolean; note?: string };
      if (!b.approvalId || typeof b.approved !== "boolean") fail(400, "approvalId and approved are required");
      // Sending and spending are the owner's call only.
      const pending = reduceRunState(store.events(p.id!)).approvals[b.approvalId!];
      if ((pending?.category === "send" || pending?.category === "spend") && me.role !== "owner") fail(403, "Only the owner can approve sending or spending");
      liveRun(p.id!).approve(b.approvalId!, b.approved!, b.note, actorOf(me));
      return { ok: true };
    },
    "run",
  );
  route(
    "POST",
    "/api/runs/:id/reassign",
    async (_q, _r, p, body, me) => {
      const b = (body ?? {}) as { nodeId?: string; agentId?: string };
      if (!b.nodeId || !b.agentId) fail(400, "nodeId and agentId are required");
      await liveRun(p.id!).reassign(b.nodeId!, b.agentId!, actorOf(me));
      return { ok: true };
    },
    "run",
  );
  route(
    "POST",
    "/api/runs/:id/redirect",
    (_q, _r, p, body, me) => {
      const b = (body ?? {}) as { nodeId?: string; note?: string };
      if (!b.nodeId || !b.note) fail(400, "nodeId and note are required");
      liveRun(p.id!).redirect(b.nodeId!, b.note!, actorOf(me));
      return { ok: true };
    },
    "run",
  );

  // People (hosted access) -------------------------------------------------
  route("GET", "/api/me", (_q, _r, _p, _b, me) => ({ ...me, hosted: !!opts.access, spentTodayUsd: me.local ? undefined : store.spentToday(me.email) }));
  route(
    "GET",
    "/api/people",
    () => [
      ...(opts.access ? [{ email: opts.access.ownerEmail, role: "owner" as const, owner: true, createdAt: "" }] : []),
      ...store.listPeople().map((x) => ({ ...x, spentTodayUsd: store.spentToday(x.email) })),
    ],
    "owner",
  );
  const personBody = (body: unknown) => {
    const b = (body ?? {}) as { email?: string; role?: string; dailyBudgetUsd?: number | null };
    const email = (b.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Enter a valid email");
    if (!b.role || !ROLES.includes(b.role as Role) || b.role === "owner") fail(400, "Role must be operator or viewer");
    if (opts.access && email === opts.access.ownerEmail) fail(400, "That's the owner");
    const budget = b.dailyBudgetUsd == null ? undefined : Number(b.dailyBudgetUsd);
    if (budget !== undefined && !(budget >= 0 && budget <= 1000)) fail(400, "Daily budget must be between 0 and 1000 USD");
    return { email, role: b.role as "operator" | "viewer", dailyBudgetUsd: b.role === "operator" ? budget ?? 0 : undefined };
  };
  route("POST", "/api/people", (_q, _r, _p, body, me) => {
    const p = personBody(body);
    if (store.getPerson(p.email)) fail(409, "Already invited");
    return store.savePerson({ ...p, invitedBy: me.email || "owner" });
  }, "owner");
  route("PUT", "/api/people/:email", (_q, _r, p, body) => {
    if (!store.getPerson(p.email!)) fail(404, "Not invited");
    return store.savePerson(personBody({ ...(body as object), email: p.email }));
  }, "owner");
  route("DELETE", "/api/people/:email", (_q, _r, p) => {
    if (!store.deletePerson(p.email!)) fail(404, "Not invited");
    return { ok: true };
  }, "owner");
  route("GET", "/api/runs/:id/files", async (_q, _r, p) => vault.listFiles(p.id!));
  route("GET", "/api/runs/:id/steps", (_q, _r, p) => store.stepRuns(p.id!));
  route("GET", "/api/runs/:id/files/:path*", async (_q, res, p) => {
    const content = await vault.readFile(p.id!, decodeURIComponent(p.path!));
    if (content === undefined) fail(404, "File not found");
    const type = p.path!.endsWith(".html") ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";
    // HTML is served as text so a generated page never executes on the app origin.
    res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
    res.end(content);
    return STREAMING;
  });

  /** Local port (127.0.0.1:4317): only localhost pages may call it; the caller is the owner. */
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (origin && isLocalOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID");
    }
    if (req.method === "OPTIONS") return void res.writeHead(204).end();
    if (origin && !isLocalOrigin(origin)) return send(res, 403, { error: "Only localhost origins are allowed" });
    // Anything that came through Cloudflare must use the tunnel port, never this one.
    if (req.headers["cf-access-jwt-assertion"] || req.headers["cf-connecting-ip"]) return send(res, 403, { error: "This port is for this computer only" });
    return dispatch(req, res, localOwner, 5_000_000);
  }

  const perUser = new RateLimiter(600, 60_000);
  const perUserWrites = new RateLimiter(120, 60_000);

  /**
   * Tunnel-only port (127.0.0.1:4318, reached through Cloudflare Tunnel + Access).
   * Every request needs a valid Cloudflare Access login for an invited person,
   * and the person's role decides what they can do.
   */
  async function handleTunnel(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const access = opts.access;
    if (!access) return send(res, 404, { error: "Hosted access is off" });
    let me: Me;
    try {
      const raw = req.headers["cf-access-jwt-assertion"];
      const email = await access.verifier.verify(Array.isArray(raw) ? raw[0] : raw);
      if (email === access.ownerEmail) me = { email, role: "owner", local: false };
      else {
        const person = store.getPerson(email);
        if (!person) return send(res, 403, { error: "You're signed in, but not invited yet — ask the owner to invite you", email });
        me = { email, role: person.role, local: false, dailyBudgetUsd: person.dailyBudgetUsd };
      }
    } catch (err) {
      return send(res, err instanceof AuthError ? err.status : 401, { error: (err as Error).message });
    }
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    if (!perUser.allow(me.email) || (mutating && !perUserWrites.allow(me.email))) return send(res, 429, { error: "Too many requests — slow down a little" });
    if (mutating) {
      // Same-origin only (the Access cookie would otherwise ride along on cross-site requests).
      if (req.headers.origin !== access.publicOrigin) return send(res, 403, { error: "Requests must come from the Agent Town page" });
      const type = String(req.headers["content-type"] ?? "");
      if (req.headers["content-length"] !== "0" && type && !type.startsWith("application/json")) return send(res, 415, { error: "JSON only" });
    }
    return dispatch(req, res, me, 2_000_000);
  }

  async function dispatch(req: IncomingMessage, res: ServerResponse, me: Me, maxBody: number) {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.pattern);
        if (!m) continue;
        if (!can(me.role, r.need)) fail(403, r.need === "owner" ? "Only the owner can do this" : "Your role can't do this");
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
        const body = req.method === "POST" || req.method === "PUT" ? await readJson(req, maxBody) : undefined;
        const out = await r.handler(req, res, params, body, me);
        if (out === STREAMING) return;
        return send(res, 200, out);
      }
      send(res, 404, { error: "Not found" });
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message, details: err.details });
      if (err instanceof ZodError) return send(res, 400, { error: "Invalid data", details: err.issues });
      if (err instanceof PreflightError) return send(res, 422, { error: err.message, details: err.result });
      send(res, 400, { error: (err as Error).message });
    }
  }

  return { handle, handleTunnel, store, engine, vault, adapters, connectors };
}

const STREAMING = Symbol("streaming");

function fail(status: number, message: string, details?: unknown): never {
  throw new HttpError(status, message, details);
}

function isLocalOrigin(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return void res.end();
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, max = 5_000_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError(413, "Body too large");
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
