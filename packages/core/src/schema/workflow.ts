import { z } from "zod";
import { SimpleWorkflow, buildGraphFromSteps } from "./simple";

/**
 * Workflow JSON — schema v1. The single source of truth for a workflow.
 * A workflow is a graph: nodes + edges. Edges carry conditions and pass outputs forward.
 *
 * Bump WORKFLOW_SCHEMA_VERSION only with a migration in `migrateWorkflow`.
 */
export const WORKFLOW_SCHEMA_VERSION = 1 as const;

export const NodeType = z.enum([
  "agentTask",
  "parallel",
  "branch",
  "toolCall",
  "humanApproval",
  "merge",
  "end",
]);
export type NodeType = z.infer<typeof NodeType>;

const Position = z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 });

const base = {
  id: z.string().min(1),
  label: z.string().default(""),
  position: Position,
  /** Max times this node may run in one run (protects against rejection loops). */
  maxRuns: z.number().int().positive().default(3),
};

/**
 * Prompt templates support:
 *   {{input.<key>}}           run input
 *   {{nodes.<nodeId>.output}} latest output of a node
 *   {{upstream}}              outputs handed to this activation (also appended automatically)
 *   {{feedback}}              output of the node that sent work back (on a re-run)
 */
export const AgentTaskConfig = z.object({
  agentId: z.string().min(1),
  prompt: z.string().default(""),
  /** If set, the output is also saved to the run vault under this file name (e.g. "landing.html"). */
  outputFile: z.string().optional(),
  /** Capabilities this node needs from the agent's runtime (checked before the run). */
  requires: z.array(z.string()).default([]),
});

export const MergeConfig = z.object({
  /** Optional synthesis agent. Without one, upstream outputs are concatenated. */
  agentId: z.string().optional(),
  prompt: z.string().default(""),
  outputFile: z.string().optional(),
  requires: z.array(z.string()).default([]),
});

export const ToolCallConfig = z.object({
  /** "connectorId.toolName" */
  tool: z.string().min(1),
  /** Arguments; string values are prompt templates. */
  args: z.record(z.string(), z.unknown()).default({}),
  /** Agent whose tool allowlist and permissions apply. Optional for built-ins that need none. */
  agentId: z.string().optional(),
});

export const HumanApprovalConfig = z.object({
  message: z.string().default("Please review and approve."),
  /** Agent shown as "waiting for you" while this approval is pending. */
  agentId: z.string().optional(),
});

export const AgentTaskNode = z.object({ ...base, type: z.literal("agentTask"), config: AgentTaskConfig });
export const ParallelNode = z.object({ ...base, type: z.literal("parallel"), config: z.object({}).default({}) });
export const BranchNode = z.object({ ...base, type: z.literal("branch"), config: z.object({}).default({}) });
export const ToolCallNode = z.object({ ...base, type: z.literal("toolCall"), config: ToolCallConfig });
export const HumanApprovalNode = z.object({
  ...base,
  type: z.literal("humanApproval"),
  config: HumanApprovalConfig.default({ message: "Please review and approve." }),
});
export const MergeNode = z.object({ ...base, type: z.literal("merge"), config: MergeConfig.default({ prompt: "", requires: [] }) });
export const EndNode = z.object({ ...base, type: z.literal("end"), config: z.object({}).default({}) });

export const WorkflowNode = z.discriminatedUnion("type", [
  AgentTaskNode,
  ParallelNode,
  BranchNode,
  ToolCallNode,
  HumanApprovalNode,
  MergeNode,
  EndNode,
]);
export type WorkflowNode = z.infer<typeof WorkflowNode>;
export type WorkflowNodeInput = z.input<typeof WorkflowNode>;

/**
 * Edge condition, evaluated against the SOURCE node's result.
 *  - always:      always taken (default)
 *  - contains / notContains / equals / matches: test the source output text (case-insensitive)
 *  - approved / rejected: outcome of a humanApproval or a gated toolCall
 *  - default:     on a branch node, taken only if no other edge matched
 */
export const EdgeCondition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("always") }),
  z.object({ type: z.literal("contains"), value: z.string() }),
  z.object({ type: z.literal("notContains"), value: z.string() }),
  z.object({ type: z.literal("equals"), value: z.string() }),
  z.object({ type: z.literal("matches"), value: z.string() }),
  z.object({ type: z.literal("approved") }),
  z.object({ type: z.literal("rejected") }),
  z.object({ type: z.literal("default") }),
]);
export type EdgeCondition = z.infer<typeof EdgeCondition>;

export const WorkflowEdge = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
  condition: EdgeCondition.default({ type: "always" }),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdge>;

export const WorkflowInput = z.object({
  key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  label: z.string().default(""),
  type: z.enum(["text", "longtext"]).default("text"),
  required: z.boolean().default(true),
  default: z.string().optional(),
});
export type WorkflowInput = z.infer<typeof WorkflowInput>;

export const Workflow = z.object({
  schemaVersion: z.literal(WORKFLOW_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Content revision, bumped on every save. */
  revision: z.number().int().positive().default(1),
  /** Team whose agents this workflow uses. */
  teamId: z.string().min(1),
  inputs: z.array(WorkflowInput).default([]),
  nodes: z.array(WorkflowNode),
  edges: z.array(WorkflowEdge),
  /**
   * Nodes a run starts from. Optional: if omitted, every node without an incoming
   * edge is an entry. Needed when a loop points back at the first node.
   */
  entryNodeIds: z.array(z.string()).optional(),
  /**
   * Step-list mode. When present, `nodes` / `edges` are generated from these steps
   * on every save (see buildGraphFromSteps). Editing the graph directly removes it.
   */
  simple: SimpleWorkflow.optional(),
  settings: z
    .object({
      /** Overrides the team's run cost cap if set. */
      costCapUsd: z.number().nonnegative().optional(),
      /** Max characters of each upstream output handed to the next node (short handoffs). */
      handoffMaxChars: z.number().int().positive().default(4000),
    })
    .default({ handoffMaxChars: 4000 }),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Workflow = z.infer<typeof Workflow>;
export type WorkflowInputJson = z.input<typeof Workflow>;

export interface WorkflowIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
  edgeId?: string;
}

/** Structural checks beyond the JSON shape. */
export function validateWorkflowGraph(wf: Workflow): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  const ids = new Set<string>();
  for (const n of wf.nodes) {
    if (ids.has(n.id)) issues.push({ level: "error", message: `Duplicate node id "${n.id}"`, nodeId: n.id });
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of wf.edges) {
    if (edgeIds.has(e.id)) issues.push({ level: "error", message: `Duplicate edge id "${e.id}"`, edgeId: e.id });
    edgeIds.add(e.id);
    if (!ids.has(e.source)) issues.push({ level: "error", message: `Edge ${e.id} has unknown source "${e.source}"`, edgeId: e.id });
    if (!ids.has(e.target)) issues.push({ level: "error", message: `Edge ${e.id} has unknown target "${e.target}"`, edgeId: e.id });
  }
  for (const id of wf.entryNodeIds ?? []) {
    if (!ids.has(id)) issues.push({ level: "error", message: `Entry node "${id}" does not exist` });
  }
  if (wf.nodes.length && entryNodes(wf).length === 0) {
    issues.push({ level: "error", message: "Workflow has no entry node: every node has an incoming edge. Set entryNodeIds." });
  }
  if (!wf.nodes.some((n) => n.type === "end")) {
    issues.push({ level: "warning", message: "Workflow has no End node; the run ends when no work is left" });
  }
  for (const n of wf.nodes) {
    const out = wf.edges.filter((e) => e.source === n.id);
    if (n.type === "branch" && out.length < 2) {
      issues.push({ level: "warning", message: `Branch "${n.label || n.id}" has fewer than 2 outgoing edges`, nodeId: n.id });
    }
    if (n.type === "humanApproval" && !out.some((e) => e.condition.type === "approved")) {
      issues.push({ level: "warning", message: `Approval "${n.label || n.id}" has no "approved" edge`, nodeId: n.id });
    }
    if (n.type !== "end" && out.length === 0) {
      issues.push({ level: "warning", message: `Node "${n.label || n.id}" has no outgoing edge`, nodeId: n.id });
    }
  }
  return issues;
}

/** Nodes a run starts from: explicit `entryNodeIds`, else nodes with no incoming edge. */
export function entryNodes(wf: Workflow): WorkflowNode[] {
  if (wf.entryNodeIds?.length) return wf.nodes.filter((n) => wf.entryNodeIds!.includes(n.id));
  const incoming = new Set(wf.edges.map((e) => e.target));
  return wf.nodes.filter((n) => !incoming.has(n.id));
}

/** Parse + migrate unknown JSON (e.g. an imported file) into a Workflow. Throws on invalid input. */
export function parseWorkflow(json: unknown): Workflow {
  return Workflow.parse(migrateWorkflow(json));
}

/** Migration hook. v1 is the first version, so this only checks the version field. */
export function migrateWorkflow(json: unknown): unknown {
  if (!json || typeof json !== "object") throw new Error("Workflow JSON must be an object");
  const v = (json as { schemaVersion?: unknown }).schemaVersion;
  if (v === undefined) return { ...(json as object), schemaVersion: 1 };
  if (v !== WORKFLOW_SCHEMA_VERSION) {
    throw new Error(`Unsupported workflow schemaVersion ${String(v)} (this build reads v${WORKFLOW_SCHEMA_VERSION})`);
  }
  return json;
}

/** For step-list workflows: regenerate the graph from the steps (no-op for graph workflows). */
export function syncSimpleWorkflow(wf: Workflow): Workflow {
  if (!wf.simple) return wf;
  const goalKey = wf.inputs.find((i) => i.key === "goal")?.key ?? wf.inputs[0]?.key;
  const { nodes, edges, entryNodeIds } = buildGraphFromSteps(wf.simple.steps, { goalKey });
  return Workflow.parse({ ...wf, nodes, edges, entryNodeIds });
}
