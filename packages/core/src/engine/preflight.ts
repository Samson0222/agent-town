import { CAPABILITIES } from "../adapters/contract";
import type { RuntimeAdapterRegistry } from "../adapters/registry";
import type { ConnectorRegistry } from "../connectors/registry";
import { resolveAgent, type AgentTemplate, type Team } from "../schema/team";
import { validateWorkflowGraph, type Workflow, type WorkflowNode } from "../schema/workflow";

export interface PreflightIssue {
  level: "error" | "warning";
  message: string;
  nodeId?: string;
  agentId?: string;
}

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
}

/** Agent id a node runs as, if any (after run-time reassignment overrides). */
export function nodeAgentId(node: WorkflowNode, overrides?: Map<string, string>): string | undefined {
  const o = overrides?.get(node.id);
  if (o) return o;
  if (node.type === "agentTask") return node.config.agentId;
  if (node.type === "merge") return node.config.agentId || undefined;
  if (node.type === "toolCall") return node.config.agentId || undefined;
  return undefined;
}

/** Does this node run a prompt on a runtime (vs. a tool call or control node)? */
export function nodeUsesRuntime(node: WorkflowNode, overrides?: Map<string, string>): boolean {
  return node.type === "agentTask" || (node.type === "merge" && !!nodeAgentId(node, overrides));
}

/**
 * Check a workflow against a team, the runtime adapters, and the connectors BEFORE a run.
 * Missing required capabilities are errors; soft gaps (no cost reporting, no cancel) are warnings.
 */
export async function preflight(
  wf: Workflow,
  team: Team,
  adapters: RuntimeAdapterRegistry,
  connectors: ConnectorRegistry,
  inputs?: Record<string, string>,
  overrides?: Map<string, string>,
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = validateWorkflowGraph(wf).map((i) => ({ level: i.level, message: i.message, nodeId: i.nodeId }));

  if (wf.teamId !== team.id) {
    issues.push({ level: "error", message: `Workflow belongs to team "${wf.teamId}" but run uses team "${team.id}"` });
  }

  if (inputs) {
    for (const i of wf.inputs) {
      if (i.required && !(inputs[i.key] ?? i.default ?? "").trim()) {
        issues.push({ level: "error", message: `Missing required input "${i.label || i.key}"` });
      }
    }
  }

  const agents = new Map(team.agents.map((a) => [a.id, a]));
  const modelCache = new Map<string, Set<string> | null>();
  const warnedAgentCap = new Set<string>();

  for (const node of wf.nodes) {
    const agentId = nodeAgentId(node, overrides);
    let agent: AgentTemplate | undefined;
    if (agentId) {
      agent = agents.get(agentId);
      if (!agent) {
        issues.push({ level: "error", message: `Node "${node.label || node.id}" uses unknown agent "${agentId}"`, nodeId: node.id });
        continue;
      }
    }

    if (agent && nodeUsesRuntime(node, overrides)) {
      issues.push(...(await checkAgentForNode(node, agent, team, adapters, modelCache, warnedAgentCap)));
    }

    if (node.type === "toolCall") {
      const auth = await connectors.authorize(node.config.tool, agent);
      if (!auth.allowed) issues.push({ level: "error", message: `Node "${node.label || node.id}": ${auth.reason}`, nodeId: node.id });
      else if (auth.needsApproval) {
        issues.push({ level: "warning", message: `Node "${node.label || node.id}" calls ${node.config.tool} (${auth.category}) — it will pause for your approval`, nodeId: node.id });
      }
    }
  }

  return { ok: !issues.some((i) => i.level === "error"), issues };
}

export async function checkAgentForNode(
  node: WorkflowNode,
  agent: AgentTemplate,
  team: Team,
  adapters: RuntimeAdapterRegistry,
  modelCache = new Map<string, Set<string> | null>(),
  warned = new Set<string>(),
): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];
  const label = node.label || node.id;
  const { runtime, model } = resolveAgent(team, agent);
  const adapter = adapters.get(runtime);
  if (!adapter) {
    issues.push({ level: "error", message: `Agent "${agent.name}" uses runtime "${runtime}", which is not installed`, nodeId: node.id, agentId: agent.id });
    return issues;
  }
  const caps = new Set(await adapter.listCapabilities());
  const requires = node.type === "agentTask" || node.type === "merge" ? node.config.requires : [];
  for (const r of requires) {
    if (!caps.has(r)) {
      issues.push({ level: "error", message: `Node "${label}" needs "${r}" but runtime "${runtime}" (agent ${agent.name}) does not support it`, nodeId: node.id, agentId: agent.id });
    }
  }
  if (!warned.has(agent.id)) {
    warned.add(agent.id);
    if (!caps.has(CAPABILITIES.costReporting)) {
      issues.push({ level: "warning", message: `Runtime "${runtime}" does not report cost — the cost cap cannot be enforced for ${agent.name}`, agentId: agent.id });
    }
    if (!caps.has(CAPABILITIES.cancellation)) {
      issues.push({ level: "warning", message: `Runtime "${runtime}" cannot cancel — Stop will wait for ${agent.name}'s current step`, agentId: agent.id });
    }
    if (agent.tools.length && !caps.has(CAPABILITIES.toolAllowlist)) {
      issues.push({ level: "warning", message: `Runtime "${runtime}" cannot enforce ${agent.name}'s tool allowlist`, agentId: agent.id });
    }
  }
  if (!modelCache.has(runtime)) {
    try {
      modelCache.set(runtime, new Set((await adapter.listModels()).map((m) => m.id)));
    } catch {
      modelCache.set(runtime, null);
    }
  }
  const models = modelCache.get(runtime);
  if (models && models.size && !models.has(model.id)) {
    issues.push({ level: "warning", message: `Model "${model.id}" is not listed by runtime "${runtime}" (agent ${agent.name})`, agentId: agent.id, nodeId: node.id });
  }
  return issues;
}
