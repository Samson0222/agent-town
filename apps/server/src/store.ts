import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Team, parseWorkflow, type AgentTownEvent, type RunStatus, type Workflow } from "@agent-town/core";

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
    `);
  }

  // Teams --------------------------------------------------------------------

  listTeams(): Team[] {
    return this.db.prepare("SELECT json FROM teams ORDER BY updated_at DESC").all().map((r) => Team.parse(JSON.parse(String(r.json))));
  }

  getTeam(id: string): Team | undefined {
    const r = this.db.prepare("SELECT json FROM teams WHERE id = ?").get(id);
    return r ? Team.parse(JSON.parse(String(r.json))) : undefined;
  }

  saveTeam(team: Team): Team {
    const now = new Date().toISOString();
    const t = { ...team, createdAt: team.createdAt ?? now, updatedAt: now };
    this.db
      .prepare("INSERT INTO teams (id, json, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at")
      .run(t.id, JSON.stringify(t), now);
    return t;
  }

  deleteTeam(id: string): boolean {
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

  createRun(id: string, wf: Workflow, team: Team, inputs: Record<string, string>): void {
    this.db
      .prepare(
        "INSERT INTO runs (id, workflow_id, workflow_name, team_id, status, inputs, workflow_snapshot, team_snapshot, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
      )
      .run(id, wf.id, wf.name, team.id, JSON.stringify(inputs), JSON.stringify(wf), JSON.stringify(team), new Date().toISOString());
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
        break;
    }
  }

  listRuns(limit = 50): RunRow[] {
    return this.db.prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?").all(limit).map(rowToRun);
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
  };
}
