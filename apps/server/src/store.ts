import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AgentTemplate,
  Skill,
  Team,
  parseWorkflow,
  mainAgentTemplate,
  remapWorkflowAgents,
  resolveTeam,
  sameAgent,
  type AgentTownEvent,
  type RunStatus,
  type Workflow,
} from "@agent-town/core";

/** Characters in the pixel-office sprite set (apps/web CHARACTER_COUNT). */
const OFFICE_CHARACTERS = 6;

/**
 * SQLite store. Events are the source of truth for runs; tasks, messages and
 * cost are projections of the event log (see reduceRunState), so the log can
 * be replayed exactly.
 */
export interface RunRow {
  id: string;
  workflowId: string;
  workflowName: string;
  teamId: string;
  status: RunStatus;
  inputs: Record<string, string>;
  costUsd: number;
  createdAt: string;
  endedAt?: string;
  /** Who started it (email) when started through hosted access; empty for local use. */
  startedBy?: string;
  purpose: RunPurpose;
}

export type RunPurpose = "work" | "plan" | "chat";

export type PlanStatus = "planning" | "proposed" | "running" | "done" | "failed" | "cancelled" | "answered" | "error";
export interface PlanRow {
  id: string;
  teamId: string;
  /** #1, #2… per workspace. */
  number: number;
  request: string;
  status: PlanStatus;
  plan?: import("@agent-town/core").Plan;
  planningRunId?: string;
  runId?: string;
  /** Saved as this workflow. */
  workflowId?: string;
  /** The main agent's combined reply (its report). */
  reply?: string;
  error?: string;
  startedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  teamId: string;
  /** The thread: which agent this conversation is with. */
  agentId: string;
  role: "person" | "agent";
  text: string;
  planId?: string;
  runId?: string;
  author?: string;
  createdAt: string;
}

export interface UsageRow {
  key: string;
  usd: number;
  tokens: number;
  steps: number;
  runs: number;
}
export interface Usage {
  days: number;
  totalUsd: number;
  runs: number;
  byDay: UsageRow[];
  byAgent: UsageRow[];
  byWorkflow: UsageRow[];
  byRuntime: UsageRow[];
}

/** An agent running outside Agent Town that reports its status into a team's office. */
export interface Reporter {
  id: string;
  teamId: string;
  name: string;
  color: string;
  /** Office character, e.g. "char-3". */
  sprite: string;
  createdAt: string;
  /** Latest report (status is one of REPORT_STATUSES). */
  status?: string;
  summary?: string;
  with?: string;
  reportedAt?: string;
}

/** A person invited to the hosted Agent Town (docs/hosting.md). */
export interface Person {
  email: string;
  role: "owner" | "operator" | "viewer";
  invitedBy?: string;
  /** Operators only: credit they may spend per day (USD). */
  dailyBudgetUsd?: number;
  createdAt: string;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, json TEXT NOT NULL,
        revision INTEGER NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, workflow_name TEXT NOT NULL,
        team_id TEXT NOT NULL, status TEXT NOT NULL, inputs TEXT NOT NULL,
        workflow_snapshot TEXT NOT NULL, team_snapshot TEXT NOT NULL,
        cost_usd REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS events (
        run_id TEXT NOT NULL, seq INTEGER NOT NULL, ts TEXT NOT NULL, type TEXT NOT NULL,
        json TEXT NOT NULL, PRIMARY KEY (run_id, seq)
      );
      CREATE INDEX IF NOT EXISTS events_type ON events(run_id, type);
      -- One row per step attempt (pattern from AI Agent Office's agent_runs table).
      CREATE TABLE IF NOT EXISTS step_runs (
        run_id TEXT NOT NULL, node_id TEXT NOT NULL, attempt INTEGER NOT NULL,
        agent_id TEXT, runtime TEXT, model TEXT, status TEXT NOT NULL,
        started_at TEXT NOT NULL, ended_at TEXT, duration_ms INTEGER,
        tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0,
        output_chars INTEGER, error TEXT,
        PRIMARY KEY (run_id, node_id, attempt)
      );
    `);
    this.db.exec(`
      -- Shared agent library (Multica-style): teams reference agents by id.
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
      -- Shared skills library.
      CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    // Additive migration for databases created before vault_dir existed.
    const cols = this.db.prepare("PRAGMA table_info(runs)").all().map((r) => String(r.name));
    if (!cols.includes("vault_dir")) this.db.exec("ALTER TABLE runs ADD COLUMN vault_dir TEXT");
    if (!cols.includes("started_by")) this.db.exec("ALTER TABLE runs ADD COLUMN started_by TEXT");
    // What a run is for: "work" (a workflow or a plan), "plan" (the main agent planning) or "chat".
    if (!cols.includes("purpose")) this.db.exec("ALTER TABLE runs ADD COLUMN purpose TEXT NOT NULL DEFAULT 'work'");
    this.db.exec(`
      -- Outside agents (Codex, other bots, scripts) that report status into an office.
      -- Only a SHA-256 hash of each token is stored.
      CREATE TABLE IF NOT EXISTS reporters (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL,
        sprite TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
        status TEXT, summary TEXT, with_id TEXT, reported_at TEXT
      );
    `);
    this.db.exec(`
      -- The main agent's plans (one per request) and chat threads (one per agent per workspace).
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, number INTEGER NOT NULL, request TEXT NOT NULL,
        status TEXT NOT NULL, plan_json TEXT, planning_run_id TEXT, run_id TEXT, workflow_id TEXT,
        reply TEXT, error TEXT, started_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS plans_team ON plans(team_id, number);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, agent_id TEXT NOT NULL, role TEXT NOT NULL,
        text TEXT NOT NULL, plan_id TEXT, run_id TEXT, author TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_thread ON messages(team_id, agent_id, created_at);
    `);
    this.db.exec(`CREATE TABLE IF NOT EXISTS dismissed (id TEXT PRIMARY KEY, at TEXT NOT NULL);`);
    this.db.exec(`
      -- People who may use the hosted Agent Town (owner comes from config, not this table).
      CREATE TABLE IF NOT EXISTS people (
        email TEXT PRIMARY KEY, role TEXT NOT NULL, invited_by TEXT,
        daily_budget_usd REAL, created_at TEXT NOT NULL
      );
    `);
  }

  // Main agent: plans and chat ---------------------------------------------

  createPlan(p: { id: string; teamId: string; request: string; startedBy?: string }): PlanRow {
    const n = Number(this.db.prepare("SELECT COALESCE(MAX(number), 0) + 1 AS n FROM plans WHERE team_id = ?").get(p.teamId)?.n ?? 1);
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO plans (id, team_id, number, request, status, started_by, created_at, updated_at) VALUES (?, ?, ?, ?, 'planning', ?, ?, ?)")
      .run(p.id, p.teamId, n, p.request, p.startedBy ?? null, now, now);
    return this.getPlan(p.id)!;
  }

  updatePlan(id: string, patch: Partial<Pick<PlanRow, "status" | "plan" | "planningRunId" | "runId" | "workflowId" | "reply" | "error">>): PlanRow | undefined {
    const cur = this.getPlan(id);
    if (!cur) return undefined;
    const n = { ...cur, ...patch };
    this.db
      .prepare("UPDATE plans SET status = ?, plan_json = ?, planning_run_id = ?, run_id = ?, workflow_id = ?, reply = ?, error = ?, updated_at = ? WHERE id = ?")
      .run(n.status, n.plan ? JSON.stringify(n.plan) : null, n.planningRunId ?? null, n.runId ?? null, n.workflowId ?? null, n.reply ?? null, n.error ?? null, new Date().toISOString(), id);
    return this.getPlan(id);
  }

  getPlan(id: string): PlanRow | undefined {
    const r = this.db.prepare("SELECT * FROM plans WHERE id = ?").get(id);
    return r ? rowToPlan(r) : undefined;
  }

  planByRun(runId: string): PlanRow | undefined {
    const r = this.db.prepare("SELECT * FROM plans WHERE run_id = ? OR planning_run_id = ?").get(runId, runId);
    return r ? rowToPlan(r) : undefined;
  }

  listPlans(teamId?: string, limit = 50): PlanRow[] {
    const rows = teamId
      ? this.db.prepare("SELECT * FROM plans WHERE team_id = ? ORDER BY number DESC LIMIT ?").all(teamId, limit)
      : this.db.prepare("SELECT * FROM plans ORDER BY created_at DESC LIMIT ?").all(limit);
    return rows.map(rowToPlan);
  }

  addMessage(m: Omit<ChatMessage, "id" | "createdAt">): ChatMessage {
    const id = crypto.randomUUID();
    const at = new Date().toISOString();
    this.db
      .prepare("INSERT INTO messages (id, team_id, agent_id, role, text, plan_id, run_id, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, m.teamId, m.agentId, m.role, m.text, m.planId ?? null, m.runId ?? null, m.author ?? null, at);
    return { ...m, id, createdAt: at };
  }

  messages(teamId: string, agentId: string, limit = 200): ChatMessage[] {
    return this.db
      .prepare("SELECT * FROM (SELECT rowid AS rn, * FROM messages WHERE team_id = ? AND agent_id = ? ORDER BY rn DESC LIMIT ?) ORDER BY rn")
      .all(teamId, agentId, limit)
      .map((r) => ({
        id: String(r.id),
        teamId: String(r.team_id),
        agentId: String(r.agent_id),
        role: String(r.role) as ChatMessage["role"],
        text: String(r.text),
        planId: r.plan_id ? String(r.plan_id) : undefined,
        runId: r.run_id ? String(r.run_id) : undefined,
        author: r.author ? String(r.author) : undefined,
        createdAt: String(r.created_at),
      }));
  }

  /** Step attempts by one agent in one workspace's runs, newest first, with the run's workflow snapshot. */
  agentHistory(agentId: string, teamId: string, limit = 40): Array<Record<string, unknown> & { workflow: Workflow }> {
    const cache = new Map<string, Workflow>();
    return this.db
      .prepare(
        `SELECT s.*, r.workflow_name, r.status AS run_status, r.purpose, r.workflow_snapshot FROM step_runs s JOIN runs r ON r.id = s.run_id
         WHERE s.agent_id = ? AND r.team_id = ? AND r.purpose = 'work' ORDER BY s.started_at DESC LIMIT ?`,
      )
      .all(agentId, teamId, limit)
      .map((r) => {
        const id = String(r.run_id);
        if (!cache.has(id)) cache.set(id, parseWorkflow(JSON.parse(String(r.workflow_snapshot))));
        const { workflow_snapshot: _s, ...rest } = r;
        return { ...rest, workflow: cache.get(id)! };
      });
  }

  // Inbox notices a person has dismissed ------------------------------------

  dismiss(id: string): void {
    this.db.prepare("INSERT OR IGNORE INTO dismissed (id, at) VALUES (?, ?)").run(id, new Date().toISOString());
  }

  isDismissed(id: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM dismissed WHERE id = ?").get(id);
  }

  // Outside agents ------------------------------------------------------------

  listReporters(teamId?: string): Reporter[] {
    const rows = teamId ? this.db.prepare("SELECT * FROM reporters WHERE team_id = ? ORDER BY created_at").all(teamId) : this.db.prepare("SELECT * FROM reporters ORDER BY created_at").all();
    return rows.map(rowToReporter);
  }

  getReporter(id: string): Reporter | undefined {
    const r = this.db.prepare("SELECT * FROM reporters WHERE id = ?").get(id);
    return r ? rowToReporter(r) : undefined;
  }

  reporterByTokenHash(hash: string): Reporter | undefined {
    const r = this.db.prepare("SELECT * FROM reporters WHERE token_hash = ?").get(hash);
    return r ? rowToReporter(r) : undefined;
  }

  createReporter(r: Omit<Reporter, "createdAt">, tokenHash: string): Reporter {
    this.db
      .prepare("INSERT INTO reporters (id, team_id, name, color, sprite, token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(r.id, r.teamId, r.name, r.color, r.sprite, tokenHash, new Date().toISOString());
    return this.getReporter(r.id)!;
  }

  setReporterToken(id: string, tokenHash: string): void {
    this.db.prepare("UPDATE reporters SET token_hash = ? WHERE id = ?").run(tokenHash, id);
  }

  saveReport(id: string, status: string, summary: string, withId: string | undefined, at = new Date()): void {
    this.db.prepare("UPDATE reporters SET status = ?, summary = ?, with_id = ?, reported_at = ? WHERE id = ?").run(status, summary, withId ?? null, at.toISOString(), id);
  }

  deleteReporter(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM reporters WHERE id = ?").run(id).changes) > 0;
  }

  // People (hosted access) ---------------------------------------------------

  listPeople(): Person[] {
    return this.db.prepare("SELECT * FROM people ORDER BY created_at").all().map(rowToPerson);
  }

  getPerson(email: string): Person | undefined {
    const r = this.db.prepare("SELECT * FROM people WHERE email = ?").get(email.toLowerCase());
    return r ? rowToPerson(r) : undefined;
  }

  savePerson(p: Omit<Person, "createdAt"> & { createdAt?: string }): Person {
    const email = p.email.trim().toLowerCase();
    const existing = this.getPerson(email);
    const createdAt = existing?.createdAt ?? p.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO people (email, role, invited_by, daily_budget_usd, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, daily_budget_usd = excluded.daily_budget_usd",
      )
      .run(email, p.role, p.invitedBy ?? existing?.invitedBy ?? null, p.dailyBudgetUsd ?? null, createdAt);
    return this.getPerson(email)!;
  }

  deletePerson(email: string): boolean {
    return Number(this.db.prepare("DELETE FROM people WHERE email = ?").run(email.toLowerCase()).changes) > 0;
  }

  setRunStartedBy(runId: string, email: string): void {
    this.db.prepare("UPDATE runs SET started_by = ? WHERE id = ?").run(email.toLowerCase(), runId);
  }

  /** Credit spent today (UTC) by runs this person started. */
  spentToday(email: string, now = new Date()): number {
    const day = now.toISOString().slice(0, 10);
    const r = this.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM runs WHERE started_by = ? AND substr(created_at, 1, 10) = ?").get(email.toLowerCase(), day);
    return Number(r?.total ?? 0);
  }

  // Agents (shared library) -------------------------------------------------

  listAgents(): AgentTemplate[] {
    return this.db.prepare("SELECT json FROM agents ORDER BY updated_at DESC").all().map((r) => AgentTemplate.parse(JSON.parse(String(r.json))));
  }

  getAgent(id: string): AgentTemplate | undefined {
    const r = this.db.prepare("SELECT json FROM agents WHERE id = ?").get(id);
    return r ? AgentTemplate.parse(JSON.parse(String(r.json))) : undefined;
  }

  saveAgent(agent: AgentTemplate): AgentTemplate {
    const a = this.withCharacter(AgentTemplate.parse(agent));
    this.db
      .prepare("INSERT INTO agents (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at")
      .run(a.id, JSON.stringify(a), new Date().toISOString());
    return a;
  }

  /**
   * Every agent gets an office character ("char-N"). Agents from older databases,
   * imports or the API without one get the least-used character, so the office
   * stays varied. The user can change it in the agent's Settings → Look.
   */
  private withCharacter(a: AgentTemplate): AgentTemplate {
    if (/^char-\d+$/.test(a.appearance.sprite ?? "")) return a;
    const used = new Array<number>(OFFICE_CHARACTERS).fill(0);
    for (const o of this.listAgents()) {
      const m = /^char-(\d+)$/.exec(o.appearance.sprite ?? "");
      if (m && o.id !== a.id) used[Number(m[1]) % OFFICE_CHARACTERS]!++;
    }
    const pick = used.indexOf(Math.min(...used));
    return { ...a, appearance: { ...a.appearance, sprite: `char-${pick}` } };
  }

  /**
   * Every workspace has a main agent. Teams from before workspaces get one here
   * (startup), so they become workspaces with nothing for the user to do.
   */
  ensureMainAgents(): number {
    let n = 0;
    for (const t of this.listTeamsRaw()) {
      if (t.mainAgentId && this.getAgent(t.mainAgentId)) continue;
      this.writeTeam({ ...t, mainAgentId: this.createMainAgent(t).id });
      n++;
    }
    return n;
  }

  createMainAgent(t: Pick<Team, "id" | "name" | "defaults">): AgentTemplate {
    const base = mainAgentTemplate(t);
    let id = base.id;
    for (let i = 2; this.getAgent(id); i++) id = `${base.id}-${i}`;
    return this.saveAgent({ ...base, id });
  }

  /** Main agent id → workspace id. */
  mainAgents(): Map<string, string> {
    return new Map(this.listTeamsRaw().filter((t) => t.mainAgentId).map((t) => [t.mainAgentId!, t.id]));
  }

  /** Startup backfill: give stored agents without a character one (see withCharacter). */
  assignMissingCharacters(): number {
    let n = 0;
    for (const a of this.listAgents()) {
      if (!/^char-\d+$/.test(a.appearance.sprite ?? "")) {
        this.saveAgent(a);
        n++;
      }
    }
    return n;
  }

  deleteAgent(id: string): boolean {
    for (const t of this.listTeamsRaw()) {
      if (t.memberIds.includes(id)) this.writeTeam({ ...t, memberIds: t.memberIds.filter((m) => m !== id) });
    }
    return Number(this.db.prepare("DELETE FROM agents WHERE id = ?").run(id).changes) > 0;
  }

  // Skills (shared library) -------------------------------------------------

  listSkills(): Skill[] {
    return this.db.prepare("SELECT json FROM skills ORDER BY updated_at DESC").all().map((r) => Skill.parse(JSON.parse(String(r.json))));
  }

  getSkill(id: string): Skill | undefined {
    const r = this.db.prepare("SELECT json FROM skills WHERE id = ?").get(id);
    return r ? Skill.parse(JSON.parse(String(r.json))) : undefined;
  }

  saveSkill(skill: Skill): Skill {
    const now = new Date().toISOString();
    const sk = Skill.parse({ ...skill, createdAt: skill.createdAt ?? now, updatedAt: now });
    this.db
      .prepare("INSERT INTO skills (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at")
      .run(sk.id, JSON.stringify(sk), now);
    return sk;
  }

  deleteSkill(id: string): boolean {
    for (const a of this.listAgents()) if (a.skills.some((r) => r.skillId === id)) this.saveAgent({ ...a, skills: a.skills.filter((r) => r.skillId !== id) });
    return Number(this.db.prepare("DELETE FROM skills WHERE id = ?").run(id).changes) > 0;
  }

  /**
   * Move agents embedded in a team into the shared library.
   * Same id + same content → shared; same id + different content → renamed `<id>-<team>`
   * and that team's workflows are updated to the new id.
   */
  private migrateTeamAgents(team: Team): Team {
    if (team.memberIds.length || !team.agents.length) return team;
    const rename = new Map<string, string>();
    const memberIds: string[] = [];
    for (const agent of team.agents) {
      let id = agent.id;
      const existing = this.getAgent(id);
      if (existing && !sameAgent(existing, agent)) {
        id = `${agent.id}-${team.id}`;
        for (let i = 2; this.getAgent(id) && !sameAgent(this.getAgent(id)!, { ...agent, id }); i++) id = `${agent.id}-${team.id}-${i}`;
        rename.set(agent.id, id);
      }
      this.saveAgent({ ...agent, id });
      memberIds.push(id);
    }
    if (rename.size) {
      for (const wf of this.listWorkflows().filter((w) => w.teamId === team.id)) this.saveWorkflow(remapWorkflowAgents(wf, rename));
    }
    return { ...team, memberIds, agents: [] };
  }

  /** One-time startup migration for databases from before the agent library existed. */
  migrateLegacyTeams(): number {
    let n = 0;
    for (const t of this.listTeamsRaw()) {
      if (!t.memberIds.length && t.agents.length) {
        this.writeTeam(this.migrateTeamAgents(t));
        n++;
      }
    }
    return n;
  }

  setRunVaultDir(runId: string, dir: string): void {
    this.db.prepare("UPDATE runs SET vault_dir = ? WHERE id = ?").run(dir, runId);
  }

  runVaultDir(runId: string): string | undefined {
    const r = this.db.prepare("SELECT vault_dir FROM runs WHERE id = ?").get(runId);
    return r?.vault_dir ? String(r.vault_dir) : undefined;
  }

  /** Step attempts by one agent across runs, newest first, with run/workflow names. */
  agentStepRuns(agentId: string, limit = 30): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT s.*, r.workflow_name, r.status AS run_status FROM step_runs s JOIN runs r ON r.id = s.run_id
         WHERE s.agent_id = ? ORDER BY s.started_at DESC LIMIT ?`,
      )
      .all(agentId, limit) as Array<Record<string, unknown>>;
  }

  /** Cost and tokens by day, agent, workflow and runtime (all runs, including planning and chat). */
  usage(teamId?: string, days = 30): Usage {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const where = `r.created_at >= ?${teamId ? " AND r.team_id = ?" : ""}`;
    const args = teamId ? [since, teamId] : [since];
    const q = (group: string, extra = "") =>
      this.db
        .prepare(
          `SELECT ${group} AS k${extra}, COALESCE(SUM(s.cost_usd),0) AS usd, COALESCE(SUM(s.tokens),0) AS tokens, COUNT(*) AS steps, COUNT(DISTINCT s.run_id) AS runs
           FROM step_runs s JOIN runs r ON r.id = s.run_id WHERE ${where} GROUP BY k ORDER BY usd DESC`,
        )
        .all(...args)
        .map((x) => ({ key: String(x.k ?? "-"), ...(x.name ? { name: String(x.name) } : {}), usd: Number(x.usd), tokens: Number(x.tokens), steps: Number(x.steps), runs: Number(x.runs) }));
    const total = this.db.prepare(`SELECT COALESCE(SUM(r.cost_usd),0) AS usd, COUNT(*) AS runs FROM runs r WHERE ${where}`).get(...args);
    return {
      days,
      totalUsd: Number(total?.usd ?? 0),
      runs: Number(total?.runs ?? 0),
      byDay: q("substr(s.started_at, 1, 10)").sort((a, b) => a.key.localeCompare(b.key)),
      byAgent: q("s.agent_id"),
      byWorkflow: q("CASE r.purpose WHEN 'work' THEN r.workflow_name WHEN 'plan' THEN 'Planning' ELSE 'Chat' END"),
      byRuntime: q("COALESCE(s.runtime, '-')"),
    };
  }

  stepRuns(runId: string): Array<Record<string, unknown>> {
    return this.db.prepare("SELECT * FROM step_runs WHERE run_id = ? ORDER BY started_at").all(runId) as Array<Record<string, unknown>>;
  }

  // Teams --------------------------------------------------------------------

  /** Teams as stored (membership only). */
  listTeamsRaw(): Team[] {
    return this.db.prepare("SELECT json FROM teams ORDER BY updated_at DESC").all().map((r) => Team.parse(JSON.parse(String(r.json))));
  }

  /** Teams with members (and the skills they use) resolved from the libraries. */
  listTeams(): Team[] {
    const agents = this.listAgents();
    const skills = this.listSkills();
    return this.listTeamsRaw().map((t) => resolveTeam(t, agents, skills));
  }

  getTeam(id: string): Team | undefined {
    const r = this.db.prepare("SELECT json FROM teams WHERE id = ?").get(id);
    return r ? resolveTeam(Team.parse(JSON.parse(String(r.json))), this.listAgents(), this.listSkills()) : undefined;
  }

  /**
   * Save a team. Membership (`memberIds`) is what is stored; resolved `agents` / `skills`
   * are dropped. A team that arrives with agents but no memberIds (older clients, imports)
   * has its agents moved into the library first.
   */
  saveTeam(team: Team): Team {
    let migrated = this.migrateTeamAgents(Team.parse(team));
    if (!migrated.mainAgentId || !this.getAgent(migrated.mainAgentId)) migrated = { ...migrated, mainAgentId: this.createMainAgent(migrated).id };
    // The main agent sits above the team: it's never one of its members.
    migrated = { ...migrated, memberIds: migrated.memberIds.filter((m) => m !== migrated.mainAgentId) };
    this.writeTeam(migrated);
    return this.getTeam(migrated.id)!;
  }

  private writeTeam(team: Team): void {
    const now = new Date().toISOString();
    const t = { ...team, agents: [], skills: [], createdAt: team.createdAt ?? now, updatedAt: now };
    this.db
      .prepare("INSERT INTO teams (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at")
      .run(t.id, JSON.stringify(t), now);
  }

  deleteTeam(id: string): boolean {
    const main = this.listTeamsRaw().find((t) => t.id === id)?.mainAgentId;
    if (main) this.db.prepare("DELETE FROM agents WHERE id = ?").run(main);
    return Number(this.db.prepare("DELETE FROM teams WHERE id = ?").run(id).changes) > 0;
  }

  // Workflows ----------------------------------------------------------------

  listWorkflows(): Workflow[] {
    return this.db.prepare("SELECT json FROM workflows ORDER BY updated_at DESC").all().map((r) => parseWorkflow(JSON.parse(String(r.json))));
  }

  getWorkflow(id: string): Workflow | undefined {
    const r = this.db.prepare("SELECT json FROM workflows WHERE id = ?").get(id);
    return r ? parseWorkflow(JSON.parse(String(r.json))) : undefined;
  }

  /** Saves and bumps the revision when the workflow already exists. */
  saveWorkflow(wf: Workflow): Workflow {
    const now = new Date().toISOString();
    const existing = this.getWorkflow(wf.id);
    const w: Workflow = {
      ...wf,
      revision: existing ? existing.revision + 1 : wf.revision,
      createdAt: existing?.createdAt ?? wf.createdAt ?? now,
      updatedAt: now,
    };
    this.db
      .prepare(
        "INSERT INTO workflows (id, team_id, json, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET team_id = excluded.team_id, json = excluded.json, revision = excluded.revision, updated_at = excluded.updated_at",
      )
      .run(w.id, w.teamId, JSON.stringify(w), w.revision, now);
    return w;
  }

  deleteWorkflow(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM workflows WHERE id = ?").run(id).changes) > 0;
  }

  workflowsForTeam(teamId: string): string[] {
    return this.db.prepare("SELECT id FROM workflows WHERE team_id = ?").all(teamId).map((r) => String(r.id));
  }

  // Runs ---------------------------------------------------------------------

  createRun(id: string, wf: Workflow, team: Team, inputs: Record<string, string>, purpose: RunPurpose = "work"): void {
    this.db
      .prepare(
        "INSERT INTO runs (id, workflow_id, workflow_name, team_id, status, inputs, workflow_snapshot, team_snapshot, created_at, purpose) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
      )
      .run(id, wf.id, wf.name, team.id, JSON.stringify(inputs), JSON.stringify(wf), JSON.stringify(team), new Date().toISOString(), purpose);
  }

  appendEvent(ev: AgentTownEvent): void {
    this.db.prepare("INSERT INTO events (run_id, seq, ts, type, json) VALUES (?, ?, ?, ?, ?)").run(ev.runId, ev.seq, ev.ts, ev.type, JSON.stringify(ev));
    switch (ev.type) {
      case "run.started":
      case "run.resumed":
        this.db.prepare("UPDATE runs SET status = 'running' WHERE id = ?").run(ev.runId);
        break;
      case "run.paused":
        this.db.prepare("UPDATE runs SET status = 'paused' WHERE id = ?").run(ev.runId);
        break;
      case "run.completed":
      case "run.failed":
      case "run.stopped":
        this.db.prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run(ev.type.slice(4), ev.ts, ev.runId);
        break;
      case "cost":
        this.db.prepare("UPDATE runs SET cost_usd = ? WHERE id = ?").run(ev.total, ev.runId);
        if (ev.nodeId) {
          this.db
            .prepare(
              "UPDATE step_runs SET tokens = tokens + ?, cost_usd = cost_usd + ? WHERE run_id = ? AND node_id = ? AND attempt = (SELECT MAX(attempt) FROM step_runs WHERE run_id = ? AND node_id = ?)",
            )
            .run((ev.cost?.inputTokens ?? 0) + (ev.cost?.outputTokens ?? 0), ev.cost?.usd ?? 0, ev.runId, ev.nodeId, ev.runId, ev.nodeId);
        }
        break;
      case "node.started":
        if (ev.nodeId) {
          this.db
            .prepare("INSERT OR REPLACE INTO step_runs (run_id, node_id, attempt, agent_id, status, started_at) VALUES (?, ?, ?, ?, 'running', ?)")
            .run(ev.runId, ev.nodeId, ev.attempt, ev.agentId ?? null, ev.ts);
        }
        break;
      case "runtime.event":
        if (ev.kind === "session.started" && ev.nodeId) {
          const model = ev.message.split(" on ").pop() ?? null;
          this.db
            .prepare("UPDATE step_runs SET runtime = ?, model = ? WHERE run_id = ? AND node_id = ? AND attempt = (SELECT MAX(attempt) FROM step_runs WHERE run_id = ? AND node_id = ?)")
            .run(ev.runtime ?? null, model, ev.runId, ev.nodeId, ev.runId, ev.nodeId);
        }
        break;
      case "node.completed":
      case "node.failed":
        if (ev.nodeId) {
          this.db
            .prepare(
              `UPDATE step_runs SET status = ?, ended_at = ?, duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER), output_chars = ?, error = ?
               WHERE run_id = ? AND node_id = ? AND attempt = (SELECT MAX(attempt) FROM step_runs WHERE run_id = ? AND node_id = ?)`,
            )
            .run(
              ev.type === "node.completed" ? (ev.outcome ?? "success") : "failed",
              ev.ts,
              ev.ts,
              ev.type === "node.completed" ? ev.output.length : null,
              ev.type === "node.failed" ? ev.error : null,
              ev.runId,
              ev.nodeId,
              ev.runId,
              ev.nodeId,
            );
        }
        break;
    }
  }

  /** Work runs, newest first. Planning and chat runs are included only when asked for. */
  listRuns(limit = 50, opts: { teamId?: string; all?: boolean } = {}): RunRow[] {
    const where = [opts.all ? "1=1" : "purpose = 'work'", opts.teamId ? "team_id = ?" : "1=1"].join(" AND ");
    const args: Array<string | number> = opts.teamId ? [opts.teamId, limit] : [limit];
    return this.db.prepare(`SELECT * FROM runs WHERE ${where} ORDER BY created_at DESC LIMIT ?`).all(...args).map(rowToRun);
  }

  getRunRow(id: string): RunRow | undefined {
    const r = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    return r ? rowToRun(r) : undefined;
  }

  getRun(id: string): (RunRow & { workflow: Workflow; team: Team }) | undefined {
    const r = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id);
    if (!r) return undefined;
    return {
      ...rowToRun(r),
      workflow: parseWorkflow(JSON.parse(String(r.workflow_snapshot))),
      team: Team.parse(JSON.parse(String(r.team_snapshot))),
    };
  }

  events(runId: string, afterSeq = 0): AgentTownEvent[] {
    return this.db
      .prepare("SELECT json FROM events WHERE run_id = ? AND seq > ? ORDER BY seq")
      .all(runId, afterSeq)
      .map((r) => JSON.parse(String(r.json)) as AgentTownEvent);
  }

  /** Runs left running/paused by a previous server process. */
  orphanedRuns(): Array<{ id: string; lastSeq: number }> {
    return this.db
      .prepare("SELECT r.id, COALESCE(MAX(e.seq), 0) AS last FROM runs r LEFT JOIN events e ON e.run_id = r.id WHERE r.status IN ('pending','running','paused') GROUP BY r.id")
      .all()
      .map((r) => ({ id: String(r.id), lastSeq: Number(r.last) }));
  }
}

function rowToRun(r: Record<string, unknown>): RunRow {
  return {
    id: String(r.id),
    workflowId: String(r.workflow_id),
    workflowName: String(r.workflow_name),
    teamId: String(r.team_id),
    status: String(r.status) as RunStatus,
    inputs: JSON.parse(String(r.inputs)),
    costUsd: Number(r.cost_usd),
    createdAt: String(r.created_at),
    endedAt: r.ended_at ? String(r.ended_at) : undefined,
    startedBy: r.started_by ? String(r.started_by) : undefined,
    purpose: (r.purpose ? String(r.purpose) : "work") as RunPurpose,
  };
}

function rowToReporter(r: Record<string, unknown>): Reporter {
  return {
    id: String(r.id),
    teamId: String(r.team_id),
    name: String(r.name),
    color: String(r.color),
    sprite: String(r.sprite),
    createdAt: String(r.created_at),
    status: r.status ? String(r.status) : undefined,
    summary: r.summary ? String(r.summary) : undefined,
    with: r.with_id ? String(r.with_id) : undefined,
    reportedAt: r.reported_at ? String(r.reported_at) : undefined,
  };
}

function rowToPerson(r: Record<string, unknown>): Person {
  return {
    email: String(r.email),
    role: String(r.role) as Person["role"],
    invitedBy: r.invited_by ? String(r.invited_by) : undefined,
    dailyBudgetUsd: r.daily_budget_usd == null ? undefined : Number(r.daily_budget_usd),
    createdAt: String(r.created_at),
  };
}

function rowToPlan(r: Record<string, unknown>): PlanRow {
  return {
    id: String(r.id),
    teamId: String(r.team_id),
    number: Number(r.number),
    request: String(r.request),
    status: String(r.status) as PlanStatus,
    plan: r.plan_json ? JSON.parse(String(r.plan_json)) : undefined,
    planningRunId: r.planning_run_id ? String(r.planning_run_id) : undefined,
    runId: r.run_id ? String(r.run_id) : undefined,
    workflowId: r.workflow_id ? String(r.workflow_id) : undefined,
    reply: r.reply ? String(r.reply) : undefined,
    error: r.error ? String(r.error) : undefined,
    startedBy: r.started_by ? String(r.started_by) : undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}
