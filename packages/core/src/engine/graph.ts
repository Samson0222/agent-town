import type { EdgeCondition, Workflow, WorkflowEdge } from "../schema/workflow";

export interface NodeResult {
  output: string;
  outcome?: "approved" | "rejected";
}

export function conditionMatches(c: EdgeCondition, r: NodeResult): boolean {
  const text = r.output.toLowerCase();
  switch (c.type) {
    case "always":
      return r.outcome !== "rejected";
    case "contains":
      return text.includes(c.value.toLowerCase());
    case "notContains":
      return !text.includes(c.value.toLowerCase());
    case "equals":
      return r.output.trim().toLowerCase() === c.value.trim().toLowerCase();
    case "matches":
      try {
        return new RegExp(c.value, "i").test(r.output);
      } catch {
        return false;
      }
    case "approved":
      return r.outcome === "approved";
    case "rejected":
      return r.outcome === "rejected";
    case "default":
      return false;
  }
}

/**
 * Pick outgoing edges for a finished node.
 *  - branch: first matching non-default edge (in edge order), else default edges
 *  - others: every matching edge, else default edges
 */
export function selectEdges(wf: Workflow, nodeId: string, isBranch: boolean, r: NodeResult): WorkflowEdge[] {
  const out = wf.edges.filter((e) => e.source === nodeId);
  const matched = out.filter((e) => e.condition.type !== "default" && conditionMatches(e.condition, r));
  const chosen = isBranch ? matched.slice(0, 1) : matched;
  if (chosen.length) return chosen;
  return out.filter((e) => e.condition.type === "default");
}

export class GraphIndex {
  private out = new Map<string, string[]>();
  constructor(wf: Workflow) {
    for (const e of wf.edges) {
      const list = this.out.get(e.source) ?? [];
      list.push(e.target);
      this.out.set(e.source, list);
    }
  }

  /** True if `target` is reachable from `from` (following edges, from != target). */
  canReach(from: string, target: string): boolean {
    if (from === target) return true;
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length) {
      const n = stack.pop()!;
      for (const m of this.out.get(n) ?? []) {
        if (m === target) return true;
        if (!seen.has(m)) {
          seen.add(m);
          stack.push(m);
        }
      }
    }
    return false;
  }
}
