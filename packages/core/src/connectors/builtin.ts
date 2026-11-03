import type { Connector, ConnectorManifest, ToolCallContext, ToolDescriptor, ToolResult, Vault } from "./contract";

/** Built-in: read/write files in the run's Markdown vault. */
export class VaultConnector implements Connector {
  readonly manifest: ConnectorManifest = {
    id: "vault",
    name: "Run vault",
    kind: "builtin",
    description: "Read and write files in this run's output folder.",
  };
  constructor(private vault: Vault) {}

  async listTools(): Promise<ToolDescriptor[]> {
    return [
      { name: "read_file", description: "Read a file from the run vault", category: "read", args: { file: { type: "string", required: true } } },
      {
        name: "write_file",
        description: "Write a file to the run vault",
        category: "write",
        args: { file: { type: "string", required: true }, content: { type: "string", required: true } },
      },
    ];
  }

  async callTool(name: string, args: Record<string, unknown>, ctx: ToolCallContext): Promise<ToolResult> {
    const file = String(args.file ?? "");
    if (!file) return { ok: false, message: "Missing 'file' argument" };
    if (name === "read_file") {
      const content = await this.vault.readFile(ctx.runId, file);
      return content === undefined ? { ok: false, message: `No such file ${file}` } : { ok: true, message: `Read ${file}`, output: content };
    }
    if (name === "write_file") {
      const res = await this.vault.writeFile(ctx.runId, file, String(args.content ?? ""));
      return { ok: true, message: `Wrote ${res.file} (${res.bytes} bytes)`, files: [res] };
    }
    return { ok: false, message: `Unknown vault tool ${name}` };
  }
}

/**
 * Mock "chat" connector with a SEND tool. Nothing leaves the machine:
 * the "sent" message is written to the run vault as outbox.md so you can see it.
 */
export class MockChatConnector implements Connector {
  readonly manifest: ConnectorManifest = {
    id: "mock-chat",
    name: "Mock chat (send)",
    kind: "mock",
    description: "Pretend to post a message. Writes to outbox.md instead of sending.",
  };
  constructor(private vault: Vault) {}

  async listTools(): Promise<ToolDescriptor[]> {
    return [
      {
        name: "send_message",
        description: "Post a message to a channel (mock: written to outbox.md)",
        category: "send",
        args: { channel: { type: "string" }, text: { type: "string", required: true } },
      },
    ];
  }

  async callTool(name: string, args: Record<string, unknown>, ctx: ToolCallContext): Promise<ToolResult> {
    if (name !== "send_message") return { ok: false, message: `Unknown tool ${name}` };
    const channel = String(args.channel ?? "#general");
    const text = String(args.text ?? "");
    const existing = (await this.vault.readFile(ctx.runId, "outbox.md")) ?? "# Outbox (mock — nothing was sent)\n";
    const res = await this.vault.writeFile(ctx.runId, "outbox.md", `${existing}\n## ${channel}\n\n${text}\n`);
    return { ok: true, message: `Mock-posted to ${channel} (see outbox.md)`, output: `Posted to ${channel}`, files: [res] };
  }
}

/** Mock read-only web search, so mock agents can show tool use. */
export class MockWebConnector implements Connector {
  readonly manifest: ConnectorManifest = { id: "mock-web", name: "Mock web search", kind: "mock" };
  async listTools(): Promise<ToolDescriptor[]> {
    return [{ name: "search", description: "Search the web (mock results)", category: "read", args: { query: { type: "string", required: true } } }];
  }
  async callTool(_name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const q = String(args.query ?? "");
    return { ok: true, message: `Searched "${q}" (mock)`, output: `Mock results for "${q}":\n- Result 1\n- Result 2` };
  }
}

/** In-memory vault for tests and the browser. */
export class MemoryVault implements Vault {
  files = new Map<string, string>();
  async writeFile(runId: string, file: string, content: string) {
    this.files.set(`${runId}/${file}`, content);
    return { file, bytes: new TextEncoder().encode(content).length };
  }
  async readFile(runId: string, file: string) {
    return this.files.get(`${runId}/${file}`);
  }
  async listFiles(runId: string) {
    return [...this.files.keys()].filter((k) => k.startsWith(`${runId}/`)).map((k) => k.slice(runId.length + 1));
  }
}
