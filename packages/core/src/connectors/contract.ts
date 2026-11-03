import type { ToolCategory } from "../schema/team";

/**
 * Layer 3 — Tool / app connector contract.
 *
 * Kinds:
 *  - "mcp":           any generic MCP server (M2)
 *  - "openconnector": self-hosted OOMOL OpenConnector gateway (M2); credentials stay behind it
 *  - "builtin":       file / vault, shell (sandboxed), web search, git
 *  - "mock":          fake connectors for zero-cost testing
 *
 * Connectors NEVER return or log credentials. The core passes no secrets to them;
 * a connector resolves its own credentials at call time.
 */
export interface ConnectorManifest {
  id: string;
  name: string;
  kind: "mcp" | "openconnector" | "builtin" | "mock";
  description?: string;
}

export interface ToolDescriptor {
  /** Tool name, unique within the connector. Full id is "connectorId.name". */
  name: string;
  description: string;
  /** Approval category. send / spend ALWAYS require a human click. */
  category: ToolCategory;
  /** Optional JSON-schema-ish description of args, for builders. */
  args?: Record<string, { type: string; description?: string; required?: boolean }>;
}

export interface ToolCallContext {
  runId: string;
  nodeId: string;
  agentId?: string;
}

export interface ToolResult {
  ok: boolean;
  /** Short human-readable summary (goes to logs — must not contain secrets). */
  message: string;
  /** Text output passed to the next node. */
  output?: string;
  /** Files written to the run vault, if any. */
  files?: Array<{ file: string; bytes: number }>;
}

export interface Connector {
  readonly manifest: ConnectorManifest;
  listTools(): Promise<ToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>, ctx: ToolCallContext): Promise<ToolResult>;
}

/** Storage for run outputs (Markdown vault). Implemented by the server (disk) or tests (memory). */
export interface Vault {
  writeFile(runId: string, file: string, content: string): Promise<{ file: string; bytes: number }>;
  readFile(runId: string, file: string): Promise<string | undefined>;
  listFiles(runId: string): Promise<string[]>;
}
