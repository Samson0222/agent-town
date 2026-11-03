/**
 * Layer 1 — Runtime adapter contract.
 *
 * The core never imports a runtime. Every runtime (Mock, OpenCode, Claude Code,
 * ACP CLIs, LangGraph/CrewAI wrappers) implements this interface in its own file
 * and is registered in the RuntimeAdapterRegistry.
 *
 * If adding a runtime needs a change to this file or to the engine, the interface
 * is wrong — flag it, fix the interface, don't special-case the core.
 */

/** Well-known capability names. Adapters may declare extra custom strings. */
export const CAPABILITIES = {
  /** Emits incremental events while working. */
  streaming: "streaming",
  /** Can run subagents inside a session. */
  subagents: "subagents",
  /** Can edit files in a workspace. */
  fileEdit: "fileEdit",
  /** Can call tools on its own. */
  toolUse: "toolUse",
  /** Enforces the per-agent tool allowlist passed in startSession. */
  toolAllowlist: "toolAllowlist",
  /** Reports token / USD cost. */
  costReporting: "costReporting",
  /** Can cancel a running prompt. */
  cancellation: "cancellation",
  /** Accepts a system prompt per session. */
  systemPrompt: "systemPrompt",
  /** Can select a model per session. */
  modelSelection: "modelSelection",
  /** Loads skills natively (otherwise the engine adds them to the instructions). */
  skills: "skills",
} as const;
export type KnownCapability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export interface CapabilityManifest {
  /** Adapter id used in agent templates, e.g. "opencode". */
  id: string;
  name: string;
  /** Adapter implementation version. */
  version: string;
  /** Version of the runtime it was built/pinned against (e.g. OpenCode "1.x.y"), if any. */
  runtimeVersion?: string;
  kind: "cli-session" | "framework" | "mock";
  capabilities: string[];
  /** True if using it can spend real money / subscription credit. */
  spendsCredit: boolean;
  description?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
}

export interface SessionOptions {
  runId: string;
  nodeId: string;
  agentId: string;
  agentName: string;
  role: string;
  systemPrompt: string;
  model: string;
  fallbackModel?: string;
  /** Tool ids the agent may use. Adapters with `toolAllowlist` must enforce it. */
  allowedTools: string[];
  /** Working directory for runtimes that edit files. */
  workdir?: string;
  /** Enabled skills, passed only to runtimes with the `skills` capability. */
  skills?: Array<{ id: string; name: string; description: string; content: string; files: Array<{ path: string; content: string }> }>;
}

export interface SessionHandle {
  sessionId: string;
}

export interface PromptInput {
  text: string;
  /** What the node expects back; lets runtimes (and the mock) shape output. */
  expectedOutput?: { format: "markdown" | "html" | "text"; file?: string };
  meta: { attempt: number; nodeLabel: string };
}

/**
 * Normalized runtime events. Each adapter maps its native stream (OpenCode SSE,
 * Claude Code SDK messages, ...) to these. The engine maps them to AgentTownEvents.
 */
export type RuntimeEvent =
  | { kind: "thinking"; message?: string }
  | { kind: "text"; delta: string }
  | { kind: "tool_use"; tool: string; input?: unknown; message?: string }
  | { kind: "tool_result"; tool: string; ok: boolean; message?: string }
  | { kind: "waiting"; message: string }
  | { kind: "cost"; usd: number; inputTokens?: number; outputTokens?: number; simulated?: boolean }
  | { kind: "log"; message: string }
  | { kind: "done"; output: string }
  | { kind: "failed"; error: string };

export type SessionStatus = "idle" | "busy" | "done" | "failed" | "cancelled";

export interface CostReport {
  usd: number;
  inputTokens: number;
  outputTokens: number;
  simulated: boolean;
}

export interface RuntimeAdapter {
  readonly manifest: CapabilityManifest;
  startSession(opts: SessionOptions): Promise<SessionHandle>;
  /** Starts work on the prompt. Returns once accepted; results arrive via streamEvents. */
  sendPrompt(sessionId: string, prompt: PromptInput): Promise<void>;
  /** Yields events for the current prompt and ends after `done` or `failed`. */
  streamEvents(sessionId: string): AsyncIterable<RuntimeEvent>;
  cancel(sessionId: string): Promise<void>;
  getStatus(sessionId: string): Promise<SessionStatus>;
  getCost(sessionId: string): Promise<CostReport>;
  listModels(): Promise<ModelInfo[]>;
  listCapabilities(): Promise<string[]>;
  /** Optional cleanup when the engine is done with a session. */
  closeSession?(sessionId: string): Promise<void>;
}
