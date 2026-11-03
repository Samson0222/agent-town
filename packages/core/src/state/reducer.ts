import type { AgentInfo, AgentStatus, AgentTownEvent, NodeRunStatus, RunStatus, TaskStage } from "../events";

/**
 * Pure projection of the event log into view state. The server, the web UI and
 * replay all use this one function, so every on-screen status is exactly
 * "the last event said so".
 */

export interface AgentState extends AgentInfo {
  status: AgentStatus;
  message?: string;
  lastSeq: number;
  costUsd: number;
}

export interface NodeState {
  id: string;
  status: NodeRunStatus;
  attempts: number;
  agentId?: string;
  output?: string;
  outcome?: "approved" | "rejected";
  error?: string;
}

export interface TaskState {
  id: string;
  nodeId: string;
  title: string;
  stage: TaskStage;
  assignee?: string;
  outputLink?: string;
  note?: string;
  lastSeq: number;
}

export interface ApprovalState {
  approvalId: string;
  nodeId?: string;
  kind: "node" | "tool";
  message: string;
  preview?: string;
  tool?: string;
  category?: string;
  agentId?: string;
  resolved?: { approved: boolean; note?: string };
}

export interface RunState {
  runId?: string;
  status: RunStatus;
  workflowId?: string;
  workflowName?: string;
  inputs: Record<string, string>;
  agents: Record<string, AgentState>;
  agentOrder: string[];
  nodes: Record<string, NodeState>;
  tasks: Record<string, TaskState>;
  approvals: Record<string, ApprovalState>;
  files: string[];
  cost: { total: number; cap: number; simulated: boolean; byAgent: Record<string, number>; byRuntime: Record<string, number> };
  warnings: string[];
  error?: string;
  endReason?: string;
  lastSeq: number;
  startedAt?: string;
  endedAt?: string;
}

export function emptyRunState(): RunState {
  return {
    status: "pending",
    inputs: {},
    agents: {},
    agentOrder: [],
    nodes: {},
    tasks: {},
    approvals: {},
    files: [],
    cost: { total: 0, cap: 0, simulated: false, byAgent: {}, byRuntime: {} },
    warnings: [],
    lastSeq: 0,
  };
}

function node(s: RunState, id: string): NodeState {
  return (s.nodes[id] ??= { id, status: "idle", attempts: 0 });
}

/** Apply one event. Mutates and returns `s` (use `reduceRunState` for an immutable replay). */
export function applyEvent(s: RunState, ev: AgentTownEvent): RunState {
  s.lastSeq = ev.seq;
  s.runId = ev.runId;
  switch (ev.type) {
    case "run.started":
      s.status = "running";
      s.workflowId = ev.workflowId;
      s.workflowName = ev.workflowName;
      s.inputs = ev.inputs;
      s.cost.cap = ev.costCapUsd;
      s.startedAt = ev.ts;
      for (const a of ev.agents) {
        s.agents[a.id] = { ...a, status: "idle", lastSeq: ev.seq, costUsd: 0 };
        if (!s.agentOrder.includes(a.id)) s.agentOrder.push(a.id);
      }
      break;
    case "preflight":
      s.warnings.push(...ev.warnings);
      break;
    case "run.paused":
      s.status = "paused";
      break;
    case "run.resumed":
      s.status = "running";
      break;
    case "run.completed":
      s.status = "completed";
      s.endedAt = ev.ts;
      break;
    case "run.failed":
      s.status = "failed";
      s.error = ev.error;
      s.endedAt = ev.ts;
      break;
    case "run.stopped":
      s.status = "stopped";
      s.endReason = ev.reason;
      s.endedAt = ev.ts;
      for (const a of Object.values(s.approvals)) if (!a.resolved) a.resolved = { approved: false, note: "run stopped" };
      break;
    case "node.queued":
      if (ev.nodeId) node(s, ev.nodeId).status = "queued";
      break;
    case "node.started":
      if (ev.nodeId) {
        const n = node(s, ev.nodeId);
        n.status = "running";
        n.attempts = ev.attempt;
        n.agentId = ev.agentId;
        n.error = undefined;
      }
      break;
    case "node.completed":
      if (ev.nodeId) {
        const n = node(s, ev.nodeId);
        n.status = "done";
        n.output = ev.output;
        n.outcome = ev.outcome;
      }
      break;
    case "node.failed":
      if (ev.nodeId) {
        const n = node(s, ev.nodeId);
        n.status = "failed";
        n.error = ev.error;
      }
      break;
    case "node.skipped":
      if (ev.nodeId) node(s, ev.nodeId).status = "skipped";
      break;
    case "agent.status":
      if (ev.from && s.agents[ev.from]) {
        const a = s.agents[ev.from]!;
        a.status = ev.status;
        a.message = ev.message;
        a.lastSeq = ev.seq;
      }
      break;
    case "task.created":
      if (ev.taskId) {
        s.tasks[ev.taskId] = { id: ev.taskId, nodeId: ev.nodeId ?? "", title: ev.title, stage: ev.stage, assignee: ev.assignee, lastSeq: ev.seq };
      }
      break;
    case "task.stage":
      if (ev.taskId && s.tasks[ev.taskId]) {
        const t = s.tasks[ev.taskId]!;
        t.stage = ev.stage;
        if (ev.outputLink) t.outputLink = ev.outputLink;
        t.lastSeq = ev.seq;
      }
      break;
    case "task.reassigned":
      if (ev.taskId && s.tasks[ev.taskId]) s.tasks[ev.taskId]!.assignee = ev.assignee;
      break;
    case "task.redirected":
      if (ev.taskId && s.tasks[ev.taskId]) s.tasks[ev.taskId]!.note = ev.note;
      break;
    case "approval.requested":
      s.approvals[ev.approvalId] = {
        approvalId: ev.approvalId,
        nodeId: ev.nodeId,
        kind: ev.kind,
        message: ev.message,
        preview: ev.preview,
        tool: ev.tool,
        category: ev.category,
        agentId: ev.from,
      };
      if (ev.nodeId) node(s, ev.nodeId).status = "waiting";
      break;
    case "approval.resolved":
      if (s.approvals[ev.approvalId]) s.approvals[ev.approvalId]!.resolved = { approved: ev.approved, note: ev.note };
      if (ev.nodeId) node(s, ev.nodeId).status = "running";
      break;
    case "output.saved":
      if (!s.files.includes(ev.file)) s.files.push(ev.file);
      break;
    case "cost":
      s.cost.total = ev.total;
      if (ev.cost?.simulated) s.cost.simulated = true;
      if (ev.from) {
        s.cost.byAgent[ev.from] = (s.cost.byAgent[ev.from] ?? 0) + (ev.cost?.usd ?? 0);
        if (s.agents[ev.from]) s.agents[ev.from]!.costUsd = s.cost.byAgent[ev.from]!;
      }
      if (ev.runtime) s.cost.byRuntime[ev.runtime] = (s.cost.byRuntime[ev.runtime] ?? 0) + (ev.cost?.usd ?? 0);
      break;
    default:
      break;
  }
  return s;
}

export function reduceRunState(events: readonly AgentTownEvent[], uptoSeq = Infinity): RunState {
  const s = emptyRunState();
  for (const ev of events) {
    if (ev.seq > uptoSeq) break;
    applyEvent(s, ev);
  }
  return s;
}

export function pendingApprovals(s: RunState): ApprovalState[] {
  return Object.values(s.approvals).filter((a) => !a.resolved);
}
