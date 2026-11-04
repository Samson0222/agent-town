import { z } from "zod";
import type { WorkflowEdge, WorkflowNodeInput } from "./workflow";

/**
 * Step-list workflows ("simple mode"): a list of steps, each with WHO and WHAT,
 * plus three toggles. The graph (nodes + edges) is generated from the list, so
 * the engine and the workflow JSON keep a single source of truth for execution.
 *
 *   step                         → Agent Task
 *   reviewBy: <agent>            → Agent Task (reviewer, VERDICT) → Decision
 *                                    approve → continue · otherwise → back to the step
 *   needsApproval                → Your approval: approved → continue · rejected → back to the step
 *   parallelWithPrevious         → steps that run side by side start from a "Run in parallel"
 *                                    node and meet again in a "Combine results" node
 */
export const SimpleStep = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().default(""),
  /** Agent id from the team. */
  who: z.string().default(""),
  /** What to do — the step's prompt. The run goal and earlier results are added automatically. */
  what: z.string().default(""),
  /** Optional file to save the result as (e.g. "brief.md", "landing.html"). */
  outputFile: z.string().optional(),
  /** Review loop: this agent checks the result and can send it back. Empty = no review. */
  reviewBy: z.string().optional(),
  needsApproval: z.boolean().default(false),
  parallelWithPrevious: z.boolean().default(false),
});
export type SimpleStep = z.infer<typeof SimpleStep>;

export const SimpleWorkflow = z.object({ steps: z.array(SimpleStep).default([]) });
export type SimpleWorkflow = z.infer<typeof SimpleWorkflow>;

const X0 = 260;
const DX = 300;
const DY = 130;

/** Generate graph nodes + edges from a step list. Deterministic: same steps → same ids. */
export function buildGraphFromSteps(steps: SimpleStep[], opts: { goalKey?: string } = {}): { nodes: WorkflowNodeInput[]; edges: WorkflowEdge[]; entryNodeIds: string[] } {
  const nodes: WorkflowNodeInput[] = [];
  const edges: WorkflowEdge[] = [];
  let e = 0;
  const edge = (source: string, target: string, condition: WorkflowEdge["condition"] = { type: "always" }, label?: string) =>
    edges.push({ id: `e${++e}`, source, target, condition, ...(label ? { label } : {}) });
  const goal = opts.goalKey ? `Goal: {{input.${opts.goalKey}}}\n\n` : "";

  // Group into stages: a step starts a new stage unless it runs in parallel with the previous one.
  const stages: SimpleStep[][] = [];
  for (const s of steps) {
    if (s.parallelWithPrevious && stages.length) stages.at(-1)!.push(s);
    else stages.push([s]);
  }

  let y = 0;
  /** Exits of the previous stage that must connect to whatever comes next. */
  let tails: Array<{ id: string; condition?: WorkflowEdge["condition"]; label?: string }> = [];
  const connect = (target: string) => {
    for (const t of tails) edge(t.id, target, t.condition, t.label);
    tails = [];
  };

  /** Emit one step's chain; returns its exit. */
  const chain = (s: SimpleStep, x: number, yStart: number): { exit: { id: string; condition?: WorkflowEdge["condition"]; label?: string }; entry: string; height: number } => {
    let yy = yStart;
    const stepId = `s-${s.id}`;
    nodes.push({
      id: stepId,
      type: "agentTask",
      label: s.title || "Step",
      position: { x, y: yy },
      config: { agentId: s.who, prompt: `${goal}${s.what}`.trim(), ...(s.outputFile ? { outputFile: s.outputFile } : {}), requires: [] },
    });
    let exit: { id: string; condition?: WorkflowEdge["condition"]; label?: string } = { id: stepId };
    if (s.reviewBy) {
      yy += DY;
      const reviewId = `s-${s.id}-review`;
      nodes.push({
        id: reviewId,
        type: "agentTask",
        label: `Review: ${s.title || "step"}`,
        position: { x, y: yy },
        config: {
          agentId: s.reviewBy,
          prompt: `${goal}Review the result of "${s.title || "the previous step"}". Start with VERDICT: APPROVE or VERDICT: REJECT, then list what to fix.\n\n{{nodes.${stepId}.output}}`,
          requires: [],
        },
      });
      edge(stepId, reviewId);
      yy += DY;
      const decisionId = `s-${s.id}-ok`;
      nodes.push({ id: decisionId, type: "branch", label: "Approved?", position: { x, y: yy } });
      edge(reviewId, decisionId);
      edge(decisionId, stepId, { type: "default" }, "send back");
      exit = { id: decisionId, condition: { type: "contains", value: "VERDICT: APPROVE" }, label: "approve" };
    }
    if (s.needsApproval) {
      yy += DY;
      const approvalId = `s-${s.id}-approval`;
      nodes.push({
        id: approvalId,
        type: "humanApproval",
        label: `Your OK: ${s.title || "step"}`,
        position: { x, y: yy },
        config: { message: `Approve "${s.title || "this step"}"?`, agentId: s.who || undefined },
      });
      edge(exit.id, approvalId, exit.condition, exit.label);
      edge(approvalId, stepId, { type: "rejected" }, "changes");
      exit = { id: approvalId, condition: { type: "approved" }, label: "approved" };
    }
    return { exit, entry: stepId, height: yy - yStart + DY };
  };

  stages.forEach((stage, si) => {
    if (stage.length === 1) {
      const c = chain(stage[0]!, X0, y);
      connect(c.entry);
      tails = [c.exit];
      y += c.height;
      return;
    }
    const fanId = `p-${si + 1}`;
    nodes.push({ id: fanId, type: "parallel", label: "Run in parallel", position: { x: X0, y } });
    connect(fanId);
    y += DY;
    const width = (stage.length - 1) * DX;
    let tallest = 0;
    const exits: typeof tails = [];
    stage.forEach((s, i) => {
      const c = chain(s, X0 - width / 2 + i * DX, y);
      edge(fanId, c.entry);
      exits.push(c.exit);
      tallest = Math.max(tallest, c.height);
    });
    y += tallest;
    const mergeId = `m-${si + 1}`;
    nodes.push({ id: mergeId, type: "merge", label: "Combine results", position: { x: X0, y }, config: { prompt: "", requires: [] } });
    tails = exits;
    connect(mergeId);
    tails = [{ id: mergeId }];
    y += DY;
  });

  nodes.push({ id: "end", type: "end", label: "Done", position: { x: X0, y } });
  connect("end");
  // Explicit entry: a review loop can point back at the first step, so "no incoming edge" isn't enough.
  return { nodes, edges, entryNodeIds: [nodes[0]!.id] };
}

let counter = 0;
export function newStepId(existing: SimpleStep[]): string {
  let id = "";
  do id = `step${existing.length + 1 + counter++}`;
  while (existing.some((s) => s.id === id));
  return id;
}
