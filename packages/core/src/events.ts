/**
 * The normalized event model — the core of Agent Town.
 *
 * Every visual change (office, graph, board, messages, logs, cost) is derived
 * from this one ordered stream via `reduceRunState`. No view may animate
 * "work" that is not backed by an event.
 */

export const AGENT_STATUSES = ["idle", "thinking", "working", "waiting-for-human", "done", "failed"] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const TASK_STAGES = ["inbox", "doing", "review", "done"] as const;
export type TaskStage = (typeof TASK_STAGES)[number];

export type RunStatus = "pending" | "running" | "paused" | "completed" | "failed" | "stopped";

export type NodeRunStatus = "idle" | "queued" | "running" | "waiting" | "done" | "failed" | "skipped";

export interface CostInfo {
  usd: number;
  inputTokens?: number;
  outputTokens?: number;
  /** True when the number is made up (mock runtime). */
  simulated?: boolean;
}

interface EventBase {
  /** Monotonic sequence within a run, assigned by the engine. */
  seq: number;
  runId: string;
  ts: string;
  /** Agent that produced / is the subject of the event. */
  from?: string;
  /** Agent receiving a handoff. */
  to?: string;
  taskId?: string;
  nodeId?: string;
  /** Runtime adapter that produced the event, e.g. "mock", "opencode". */
  runtime?: string;
  /** Connector that produced the event, e.g. "vault", "mcp:github". */
  connector?: string;
  cost?: CostInfo;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  department: string;
  color: string;
  sprite: string;
  desk?: { x: number; y: number };
  runtime: string;
  model: string;
}

export type AgentTownEventBody =
  | { type: "run.started"; workflowId: string; workflowName: string; inputs: Record<string, string>; agents: AgentInfo[]; costCapUsd: number }
  | { type: "run.paused"; reason?: string }
  | { type: "run.resumed" }
  | { type: "run.completed"; outputs: string[] }
  | { type: "run.failed"; error: string }
  | { type: "run.stopped"; reason: string }
  | { type: "preflight"; warnings: string[] }
  | { type: "node.queued"; attempt: number }
  | { type: "node.started"; attempt: number; agentId?: string }
  | { type: "node.completed"; output: string; outcome?: "approved" | "rejected" }
  | { type: "node.failed"; error: string }
  | { type: "node.skipped"; reason: string }
  | { type: "agent.status"; status: AgentStatus; message?: string }
  | { type: "task.created"; title: string; assignee?: string; stage: TaskStage }
  | { type: "task.stage"; stage: TaskStage; outputLink?: string }
  | { type: "task.reassigned"; assignee: string; previous?: string }
  | { type: "task.redirected"; note: string }
  | { type: "message"; message: string; kind: "handoff" | "feedback" | "info" }
  | { type: "runtime.event"; kind: string; message: string }
  | { type: "tool.call"; tool: string; category: string; args?: unknown }
  | { type: "tool.result"; tool: string; ok: boolean; message: string }
  | { type: "approval.requested"; approvalId: string; message: string; preview?: string; kind: "node" | "tool"; tool?: string; category?: string }
  | { type: "approval.resolved"; approvalId: string; approved: boolean; note?: string }
  | { type: "output.saved"; file: string; bytes: number }
  | { type: "cost"; total: number };

export type AgentTownEvent = EventBase & AgentTownEventBody;
export type AgentTownEventType = AgentTownEvent["type"];

/** Shape the engine accepts before it stamps seq/runId/ts. */
export type EventDraft = Omit<EventBase, "seq" | "runId" | "ts"> & AgentTownEventBody;
