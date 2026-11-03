import type { AgentTemplate, ToolCategory } from "../schema/team";
import type { Connector, ConnectorManifest, ToolCallContext, ToolDescriptor, ToolResult } from "./contract";

export interface ToolAuthorization {
  allowed: boolean;
  needsApproval: boolean;
  category?: ToolCategory;
  reason?: string;
  descriptor?: ToolDescriptor;
}

/** Categories that can never run without a human click. Not configurable. */
export const ALWAYS_APPROVE: readonly ToolCategory[] = ["send", "spend"];

export function splitToolId(toolId: string): { connectorId: string; tool: string } {
  const i = toolId.indexOf(".");
  if (i <= 0) throw new Error(`Tool id must be "connectorId.toolName", got "${toolId}"`);
  return { connectorId: toolId.slice(0, i), tool: toolId.slice(i + 1) };
}

/** Allowlist entries: "*", "connector.*", or "connector.tool". */
export function isToolAllowed(allowlist: string[], toolId: string): boolean {
  const { connectorId } = splitToolId(toolId);
  return allowlist.some((p) => p === "*" || p === toolId || p === `${connectorId}.*`);
}

/**
 * Loads connectors and enforces per-agent allowlists + approval categories.
 * The engine must call `authorize` before `execute`, and obtain a human approval
 * whenever `needsApproval` is true.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, Connector>();
  private toolCache = new Map<string, ToolDescriptor[]>();

  register(c: Connector): this {
    if (this.connectors.has(c.manifest.id)) throw new Error(`Connector "${c.manifest.id}" is already registered`);
    this.connectors.set(c.manifest.id, c);
    return this;
  }

  manifests(): ConnectorManifest[] {
    return [...this.connectors.values()].map((c) => c.manifest);
  }

  async listAllTools(): Promise<Array<ToolDescriptor & { id: string; connector: string }>> {
    const out: Array<ToolDescriptor & { id: string; connector: string }> = [];
    for (const c of this.connectors.values()) {
      for (const t of await this.tools(c.manifest.id)) out.push({ ...t, id: `${c.manifest.id}.${t.name}`, connector: c.manifest.id });
    }
    return out;
  }

  async describe(toolId: string): Promise<ToolDescriptor | undefined> {
    const { connectorId, tool } = splitToolId(toolId);
    if (!this.connectors.has(connectorId)) return undefined;
    return (await this.tools(connectorId)).find((t) => t.name === tool);
  }

  /**
   * @param agent the agent whose allowlist applies; undefined = system call (no allowlist,
   *              but send/spend still need approval and write needs approval).
   */
  async authorize(toolId: string, agent?: AgentTemplate): Promise<ToolAuthorization> {
    const descriptor = await this.describe(toolId);
    if (!descriptor) return { allowed: false, needsApproval: false, reason: `Unknown tool "${toolId}"` };
    const category = descriptor.category;
    if (agent && !isToolAllowed(agent.tools, toolId)) {
      return { allowed: false, needsApproval: false, category, descriptor, reason: `Agent "${agent.name}" is not allowed to use ${toolId}` };
    }
    let needsApproval = ALWAYS_APPROVE.includes(category);
    if (category === "write") needsApproval = !(agent?.permissions.autoApproveWrite ?? false);
    return { allowed: true, needsApproval, category, descriptor };
  }

  /** Execute a tool. Callers must have authorized it (and obtained approval if needed). */
  async execute(toolId: string, args: Record<string, unknown>, ctx: ToolCallContext, approvalToken?: { approved: true }): Promise<ToolResult> {
    const descriptor = await this.describe(toolId);
    if (!descriptor) return { ok: false, message: `Unknown tool "${toolId}"` };
    if (ALWAYS_APPROVE.includes(descriptor.category) && !approvalToken?.approved) {
      // Defence in depth: never run send/spend without an approval token.
      return { ok: false, message: `Refused: ${toolId} is a ${descriptor.category} tool and needs human approval` };
    }
    const { connectorId, tool } = splitToolId(toolId);
    try {
      return await this.connectors.get(connectorId)!.callTool(tool, args, ctx);
    } catch (err) {
      return { ok: false, message: `Tool error: ${(err as Error).message}` };
    }
  }

  private async tools(connectorId: string): Promise<ToolDescriptor[]> {
    let t = this.toolCache.get(connectorId);
    if (!t) {
      t = await this.connectors.get(connectorId)!.listTools();
      this.toolCache.set(connectorId, t);
    }
    return t;
  }
}
