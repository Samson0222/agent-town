/**
 * OpenCode 2.2.0 runtime adapter for Agent Town.
 *
 * Talks to a local `opencode serve` (127.0.0.1, OPENCODE_SERVER_PASSWORD as Basic
 * auth — verified in M0) through `@opencode/client@2.2.0`, the HTTP client for 2.x.
 * Built against the client's type definitions and the M0 findings in
 * docs/milestone-0-opencode.md. This file is the whole integration: the engine and
 * core are unchanged apart from optional, additive contract fields.
 *
 * Mapping (OpenCode event → Agent Town RuntimeEvent):
 *   session.execution.started            → thinking
 *   session.reasoning.delta              → thinking
 *   session.text.delta                   → text
 *   session.tool.input.started (name)    → remembered for the next two
 *   session.tool.called                  → tool_use
 *   session.tool.success / .failed       → tool_result
 *   permission.asked                     → waiting with requestId → Agent Town's approval banner → permission.reply
 *   session.usage.updated (cumulative)   → cost (delta since last update)
 *   session.execution.succeeded          → done (accumulated text)
 *   session.execution.failed / .interrupted → failed
 *
 * LIMITATIONS (recorded in docs/discussion.md):
 *  - Sessions are locked down: every OpenCode tool is denied unless the agent may
 *    use the shell (then shell is allowed; everything else still denied), and they run
 *    in an empty scratch folder, never the project. Anything OpenCode still asks about
 *    comes to Agent Town as an approval.
 *  - Agent Town skills are sent in the instructions, not via OpenCode's `skills`
 *    prompt field (that field refers to skills installed in OpenCode).
 */
import {
  CAPABILITIES,
  type CapabilityManifest,
  type CostReport,
  type ModelInfo,
  type PromptInput,
  type RuntimeAdapter,
  type RuntimeEvent,
  type SessionHandle,
  type SessionOptions,
  type SessionStatus,
} from "@agent-town/core";

export const OPENCODE_VERSION = "2.2.0";

export type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [k: string]: JsonValue };

/** The subset of the @opencode/client 2.2.0 surface this adapter uses (lets tests pass a fake). */
export interface OpenCodeClientLike {
  session: {
    create(input: {
      title?: string;
      agent?: string;
      model?: { id: string; providerID: string };
      location?: { directory: string };
      metadata?: { readonly [k: string]: JsonValue };
      permissions?: Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }>;
    }): Promise<{ id: string; cost?: number; tokens?: TokenUsage }>;
    prompt(input: { sessionID: string; text: string }): Promise<unknown>;
    interrupt(input: { sessionID: string }): Promise<unknown>;
    get(input: { sessionID: string }): Promise<{ id: string; cost?: number; tokens?: TokenUsage; outcome?: string }>;
    remove?(input: { sessionID: string }): Promise<unknown>;
  };
  permission?: { reply(input: { sessionID: string; requestID: string; decision: "once" | "always" | "reject"; message?: string }): Promise<unknown> };
  model: { list(): Promise<{ data: OpenCodeModel[] } | OpenCodeModel[]> };
  /** 2.2.0 shape: one options object (types + signal) → an async iterable (not a Promise). */
  event: { subscribe(options: { types: readonly OpenCodeEventType[]; signal?: AbortSignal }): AsyncIterable<OpenCodeEvent> | Promise<AsyncIterable<OpenCodeEvent>> };
}

export interface TokenUsage {
  input: number;
  output: number;
  reasoning?: number;
  cache?: { read: number; write: number };
}

export interface OpenCodeModel {
  id: string;
  modelID?: string;
  providerID: string;
  name?: string;
  enabled?: boolean;
  status?: string;
}

export interface OpenCodeEvent {
  type: string;
  data?: Record<string, any>;
}

export interface OpenCodeAdapterOptions {
  /** e.g. http://127.0.0.1:4096 — must be localhost. */
  baseUrl?: string;
  /** OPENCODE_SERVER_PASSWORD; sent as HTTP Basic auth (user "opencode"). Never logged. */
  password?: string;
  /** Working directory for sessions (the project folder agents may edit). */
  directory: string;
  /** OpenCode agent to run as (default "build", OpenCode's default agent). */
  agent?: string;
  /** Keep sessions in OpenCode after a step (default true, so you can inspect them there). */
  keepSessions?: boolean;
  /** Inject a client (tests). Otherwise one is created with @opencode/client. */
  client?: OpenCodeClientLike;
}

export const EVENT_TYPES = [
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.text.delta",
  "session.reasoning.delta",
  "session.tool.input.started",
  "session.tool.called",
  "session.tool.success",
  "session.tool.failed",
  "session.usage.updated",
  "permission.asked",
] as const;
export type OpenCodeEventType = (typeof EVENT_TYPES)[number];

interface SessionState {
  queue: RuntimeEvent[];
  waiters: Array<() => void>;
  text: string;
  status: SessionStatus;
  cost: number;
  tokens: { input: number; output: number };
  toolNames: Map<string, string>;
  finished: boolean;
}

/** Build a real client with @opencode/client (loaded lazily so tests never need it). */
export async function createOpenCodeClient(baseUrl: string, password?: string): Promise<OpenCodeClientLike> {
  const host = new URL(baseUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) throw new Error("OpenCode must be reached on localhost only");
  const { OpenCode } = (await import("@opencode/client")) as unknown as { OpenCode: { make(o: { baseUrl: string; headers?: Record<string, string> }): OpenCodeClientLike } };
  const headers = password ? { Authorization: "Basic " + btoa(`opencode:${password}`) } : undefined;
  return OpenCode.make({ baseUrl, headers });
}

/** "opencode-go/kimi-k3" → { providerID: "opencode-go", id: "kimi-k3" }; "openrouter/~a/b" keeps the rest as id. */
export function splitModel(model: string): { providerID: string; id: string } {
  const i = model.indexOf("/");
  if (i <= 0) throw new Error(`OpenCode model ids look like "provider/model", got "${model}"`);
  return { providerID: model.slice(0, i), id: model.slice(i + 1) };
}

export class OpenCodeAdapter implements RuntimeAdapter {
  readonly manifest: CapabilityManifest = {
    id: "opencode",
    name: "OpenCode",
    version: "0.1.0",
    runtimeVersion: OPENCODE_VERSION,
    kind: "cli-session",
    spendsCredit: true,
    description: "Your local OpenCode (opencode serve) — uses your OpenCode subscription / providers.",
    capabilities: [
      CAPABILITIES.streaming,
      CAPABILITIES.toolUse,
      CAPABILITIES.fileEdit,
      CAPABILITIES.costReporting,
      CAPABILITIES.cancellation,
      CAPABILITIES.systemPrompt,
      CAPABILITIES.modelSelection,
    ],
  };

  private client: OpenCodeClientLike | null;
  private clientPromise: Promise<OpenCodeClientLike> | null = null;
  private sessions = new Map<string, SessionState>();
  private hub: { abort: AbortController; running: Promise<void> } | null = null;
  private instructions = new Map<string, string>();
  private permissionsFor = new Map<string, SessionOptions["permissions"]>();

  constructor(private opts: OpenCodeAdapterOptions) {
    this.client = opts.client ?? null;
  }

  private async c(): Promise<OpenCodeClientLike> {
    if (this.client) return this.client;
    this.clientPromise ??= createOpenCodeClient(this.opts.baseUrl ?? "http://127.0.0.1:4096", this.opts.password);
    this.client = await this.clientPromise;
    return this.client;
  }

  // ---------------------------------------------------------------------------
  // Event hub: one subscription for all sessions, routed by sessionID.

  private async ensureHub() {
    if (this.hub) return;
    const client = await this.c();
    const abort = new AbortController();
    const running = (async () => {
      let backoff = 500;
      while (!abort.signal.aborted) {
        try {
          const stream = await client.event.subscribe({ types: EVENT_TYPES, signal: abort.signal });
          backoff = 500;
          for await (const ev of stream) this.route(ev);
        } catch (err) {
          if (abort.signal.aborted) return;
          for (const s of this.sessions.values()) if (!s.finished) this.push(s, { kind: "log", message: `OpenCode event stream dropped (${(err as Error).message}); reconnecting…` });
        }
        if (abort.signal.aborted) return;
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 8000);
      }
    })();
    this.hub = { abort, running };
  }

  /** Stop listening to OpenCode (server shutdown / tests). */
  async dispose() {
    this.hub?.abort.abort();
    this.hub = null;
  }

  private route(ev: OpenCodeEvent) {
    const d = ev.data ?? {};
    const s = this.sessions.get(String(d.sessionID ?? ""));
    if (!s || s.finished) return;
    switch (ev.type) {
      case "session.execution.started":
        s.status = "busy";
        this.push(s, { kind: "thinking", message: "OpenCode is working" });
        break;
      case "session.reasoning.delta":
        this.push(s, { kind: "thinking" });
        break;
      case "session.text.delta":
        s.text += String(d.delta ?? "");
        this.push(s, { kind: "text", delta: String(d.delta ?? "") });
        break;
      case "session.tool.input.started":
        s.toolNames.set(String(d.id), String(d.name ?? "tool"));
        break;
      case "session.tool.called":
        this.push(s, { kind: "tool_use", tool: s.toolNames.get(String(d.id)) ?? "tool", input: d.input });
        break;
      case "session.tool.success":
        this.push(s, { kind: "tool_result", tool: s.toolNames.get(String(d.id)) ?? "tool", ok: true });
        break;
      case "session.tool.failed":
        this.push(s, { kind: "tool_result", tool: s.toolNames.get(String(d.id)) ?? "tool", ok: false, message: d.error?.message });
        break;
      case "permission.asked": {
        const what = [d.action, ...(Array.isArray(d.resources) ? d.resources : [])].filter(Boolean).join(" ");
        this.push(s, { kind: "waiting", message: `OpenCode asks: ${d.message ?? what}`, requestId: d.id ? String(d.id) : undefined, action: d.action ? String(d.action) : undefined });
        break;
      }
      case "session.usage.updated": {
        const cost = Number(d.cost ?? 0);
        const tin = Number(d.tokens?.input ?? 0);
        const tout = Number(d.tokens?.output ?? 0) + Number(d.tokens?.reasoning ?? 0);
        const usd = Math.max(0, cost - s.cost);
        const di = Math.max(0, tin - s.tokens.input);
        const dout = Math.max(0, tout - s.tokens.output);
        s.cost = Math.max(s.cost, cost);
        s.tokens = { input: Math.max(s.tokens.input, tin), output: Math.max(s.tokens.output, tout) };
        if (usd > 0 || di > 0 || dout > 0) this.push(s, { kind: "cost", usd, inputTokens: di, outputTokens: dout });
        break;
      }
      case "session.execution.succeeded":
        s.status = "done";
        s.finished = true;
        this.push(s, { kind: "done", output: s.text });
        break;
      case "session.execution.failed":
        s.status = "failed";
        s.finished = true;
        this.push(s, { kind: "failed", error: d.error?.message ?? "OpenCode reported a failure" });
        break;
      case "session.execution.interrupted":
        s.status = "cancelled";
        s.finished = true;
        this.push(s, { kind: "failed", error: `interrupted (${d.reason ?? "unknown"})` });
        break;
    }
  }

  private push(s: SessionState, ev: RuntimeEvent) {
    s.queue.push(ev);
    for (const w of s.waiters.splice(0)) w();
  }

  // ---------------------------------------------------------------------------
  // RuntimeAdapter

  async startSession(opts: SessionOptions): Promise<SessionHandle> {
    const client = await this.c();
    await this.ensureHub();
    const permissions = sessionPermissions(opts.permissions);
    const info = await client.session.create({
      title: `Agent Town · ${opts.agentName} · ${opts.nodeId}`,
      agent: this.opts.agent ?? "build",
      model: splitModel(opts.model),
      location: { directory: opts.workdir ?? this.opts.directory },
      metadata: { agentTown: { runId: opts.runId, nodeId: opts.nodeId, agentId: opts.agentId } },
      permissions,
    });
    this.sessions.set(info.id, {
      queue: [],
      waiters: [],
      text: "",
      status: "idle",
      cost: Number(info.cost ?? 0),
      tokens: { input: Number(info.tokens?.input ?? 0), output: Number(info.tokens?.output ?? 0) },
      toolNames: new Map(),
      finished: false,
    });
    this.instructions.set(info.id, [opts.role ? `You are ${opts.agentName}, ${opts.role}.` : "", opts.systemPrompt].filter(Boolean).join("\n\n"));
    this.permissionsFor.set(info.id, opts.permissions);
    return { sessionId: info.id };
  }

  async sendPrompt(sessionId: string, prompt: PromptInput): Promise<void> {
    const s = this.must(sessionId);
    s.status = "busy";
    s.finished = false;
    s.text = "";
    const instructions = this.instructions.get(sessionId);
    const format =
      prompt.expectedOutput?.format === "html"
        ? "\n\nReply with only the complete HTML document (no explanation)."
        : prompt.expectedOutput?.file
          ? `\n\nYour reply will be saved as ${prompt.expectedOutput.file}.`
          : "";
    const text = `${instructions ? `## Your role and instructions\n\n${instructions}\n\n---\n\n` : ""}${prompt.text}${format}`;
    try {
      await (await this.c()).session.prompt({ sessionID: sessionId, text });
    } catch (err) {
      s.finished = true;
      s.status = "failed";
      this.push(s, { kind: "failed", error: `OpenCode did not accept the prompt: ${(err as Error).message}` });
    }
  }

  async *streamEvents(sessionId: string): AsyncIterable<RuntimeEvent> {
    const s = this.must(sessionId);
    while (true) {
      const ev = s.queue.shift();
      if (ev) {
        yield ev;
        if (ev.kind === "done" || ev.kind === "failed") return;
        continue;
      }
      await new Promise<void>((r) => s.waiters.push(r));
    }
  }

  /** Pass a person's answer back to OpenCode. "Yes" allows this one request only. */
  async respond(sessionId: string, requestId: string, approved: boolean, note?: string): Promise<void> {
    const client = await this.c();
    if (!client.permission) throw new Error("This OpenCode client can't answer permission requests");
    await client.permission.reply({ sessionID: sessionId, requestID: requestId, decision: approved ? "once" : "reject", ...(note ? { message: note } : {}) });
  }

  async cancel(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s || s.finished) return;
    await (await this.c()).session.interrupt({ sessionID: sessionId });
  }

  async getStatus(sessionId: string): Promise<SessionStatus> {
    return this.must(sessionId).status;
  }

  async getCost(sessionId: string): Promise<CostReport> {
    const info = await (await this.c()).session.get({ sessionID: sessionId });
    return {
      usd: Number(info.cost ?? 0),
      inputTokens: Number(info.tokens?.input ?? 0),
      outputTokens: Number(info.tokens?.output ?? 0) + Number(info.tokens?.reasoning ?? 0),
      simulated: false,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    const out = await (await this.c()).model.list();
    const list = Array.isArray(out) ? out : out.data;
    return list
      .filter((m) => m.enabled !== false && m.status !== "deprecated")
      .map((m) => ({ id: `${m.providerID}/${m.id}`, name: m.name, provider: m.providerID }));
  }

  async listCapabilities(): Promise<string[]> {
    return [...this.manifest.capabilities];
  }

  async closeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    this.instructions.delete(sessionId);
    this.permissionsFor.delete(sessionId);
    if (this.opts.keepSessions === false) await (await this.c()).session.remove?.({ sessionID: sessionId }).catch(() => undefined);
  }

  private must(id: string): SessionState {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Unknown OpenCode session ${id}`);
    return s;
  }
}

/**
 * Session rules: deny every OpenCode tool, so agents answer in text and Agent Town
 * saves the result. An agent allowed to use the shell gets shell back (OpenCode still
 * asks before anything its own config marks "ask", and that comes to Agent Town).
 * The deny-all rule comes first and last, so it wins whichever way OpenCode orders rules.
 */
export function sessionPermissions(p?: SessionOptions["permissions"]): Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }> {
  const rules: Array<{ action: string; resource: string; effect: "allow" | "deny" | "ask" }> = [{ action: "*", resource: "*", effect: "deny" }];
  if (p?.shell) rules.push({ action: "shell", resource: "*", effect: "ask" });
  rules.push({ action: "external_directory", resource: "*", effect: "deny" });
  return rules;
}
