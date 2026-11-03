import type {
  CapabilityManifest,
  CostReport,
  ModelInfo,
  PromptInput,
  RuntimeAdapter,
  RuntimeEvent,
  SessionHandle,
  SessionOptions,
  SessionStatus,
} from "./contract";
import { CAPABILITIES } from "./contract";

/**
 * Mock runtime: same contract as a real runtime, fake agents, zero spend.
 *
 * The delays here are the *runtime* taking time to produce events. The UI
 * animates only because events arrive — never on its own timer.
 *
 * Deterministic behaviour so demos and tests are repeatable:
 *  - A step asked to "start with VERDICT" / "VERDICT first" (a reviewer) REJECTS on attempt 1, APPROVES after.
 *  - expectedOutput.format === "html" produces an HTML page.
 *  - A prompt containing "[mock:fail]" fails (to test failure handling).
 */
export interface MockAdapterOptions {
  /** Delay between streamed events, in ms. 0 for tests. */
  stepMs?: number;
  /** Simulated USD per 1K output tokens. */
  usdPer1kTokens?: number;
}

interface MockSession {
  opts: SessionOptions;
  status: SessionStatus;
  cost: CostReport;
  queue: RuntimeEvent[];
  waiters: Array<() => void>;
  cancelled: boolean;
  finished: boolean;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MockAdapter implements RuntimeAdapter {
  readonly manifest: CapabilityManifest = {
    id: "mock",
    name: "Mock runtime",
    version: "0.3.0",
    kind: "mock",
    spendsCredit: false,
    description: "Fake agents for zero-cost testing of builders and views.",
    capabilities: [
      CAPABILITIES.streaming,
      CAPABILITIES.toolUse,
      CAPABILITIES.toolAllowlist,
      CAPABILITIES.costReporting,
      CAPABILITIES.cancellation,
      CAPABILITIES.systemPrompt,
      CAPABILITIES.modelSelection,
      CAPABILITIES.fileEdit,
    ],
  };

  private sessions = new Map<string, MockSession>();
  private counter = 0;
  private stepMs: number;
  private rate: number;

  constructor(opts: MockAdapterOptions = {}) {
    this.stepMs = opts.stepMs ?? 350;
    this.rate = opts.usdPer1kTokens ?? 0.002;
  }

  async startSession(opts: SessionOptions): Promise<SessionHandle> {
    const sessionId = `mock-${++this.counter}`;
    this.sessions.set(sessionId, {
      opts,
      status: "idle",
      cost: { usd: 0, inputTokens: 0, outputTokens: 0, simulated: true },
      queue: [],
      waiters: [],
      cancelled: false,
      finished: false,
    });
    return { sessionId };
  }

  async sendPrompt(sessionId: string, prompt: PromptInput): Promise<void> {
    const s = this.must(sessionId);
    s.status = "busy";
    s.finished = false;
    void this.produce(s, prompt);
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

  async cancel(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s || s.finished) return;
    s.cancelled = true;
  }

  async getStatus(sessionId: string): Promise<SessionStatus> {
    return this.must(sessionId).status;
  }

  async getCost(sessionId: string): Promise<CostReport> {
    return { ...this.must(sessionId).cost };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "mock/fast", name: "Mock fast", provider: "mock" },
      { id: "mock/standard", name: "Mock standard", provider: "mock" },
      { id: "mock/deep", name: "Mock deep", provider: "mock" },
    ];
  }

  async listCapabilities(): Promise<string[]> {
    return [...this.manifest.capabilities];
  }

  async closeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  // ---------------------------------------------------------------------------

  private must(id: string): MockSession {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Unknown mock session ${id}`);
    return s;
  }

  private push(s: MockSession, ev: RuntimeEvent) {
    s.queue.push(ev);
    const w = s.waiters.splice(0);
    w.forEach((fn) => fn());
  }

  private async produce(s: MockSession, prompt: PromptInput) {
    const step = async () => {
      if (this.stepMs) await sleep(this.stepMs * (0.6 + Math.random() * 0.8));
      if (s.cancelled) throw new Error("cancelled");
    };
    try {
      await step();
      this.push(s, { kind: "thinking", message: `${s.opts.agentName} is reading the brief` });
      await step();

      if (prompt.text.includes("[mock:fail]")) {
        throw new Error("Mock failure requested by prompt");
      }

      const tool = s.opts.allowedTools[0];
      if (tool) {
        this.push(s, { kind: "tool_use", tool, message: `Using ${tool}` });
        await step();
        this.push(s, { kind: "tool_result", tool, ok: true, message: "ok (mock)" });
        await step();
      }

      const output = mockOutput(s.opts, prompt);
      const chunks = splitChunks(output, 4);
      for (const c of chunks) {
        this.push(s, { kind: "text", delta: c });
        await step();
      }
      const outTokens = Math.ceil(output.length / 4);
      const inTokens = Math.ceil(prompt.text.length / 4);
      const usd = +((outTokens + inTokens * 0.25) / 1000 * this.rate).toFixed(6);
      s.cost.usd += usd;
      s.cost.inputTokens += inTokens;
      s.cost.outputTokens += outTokens;
      this.push(s, { kind: "cost", usd, inputTokens: inTokens, outputTokens: outTokens, simulated: true });
      s.status = "done";
      s.finished = true;
      this.push(s, { kind: "done", output });
    } catch (err) {
      s.finished = true;
      s.status = s.cancelled ? "cancelled" : "failed";
      this.push(s, { kind: "failed", error: s.cancelled ? "cancelled" : (err as Error).message });
    }
  }
}

function splitChunks(text: string, n: number): string[] {
  const size = Math.ceil(text.length / n);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function firstLine(text: string, max = 120): string {
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > max ? line.slice(0, max) + "…" : line;
}

/** Deterministic fake output shaped by role, prompt, and expected format. */
export function mockOutput(opts: SessionOptions, prompt: PromptInput): string {
  const goal = firstLine(prompt.text);
  const who = `${opts.agentName} (${opts.role})`;

  const asksVerdict = /VERDICT first|start (your answer )?with\W*VERDICT/i.test(`${opts.systemPrompt}\n${prompt.text}`);
  if (asksVerdict) {
    if (prompt.meta.attempt <= 1) {
      return [
        `VERDICT: REJECT`,
        ``,
        `Reviewed by ${who}.`,
        `- The pricing claim is not supported by the research notes. Cite the competitor price range.`,
        `- The tagline and the positioning statement use different tones; pick one.`,
      ].join("\n");
    }
    return [`VERDICT: APPROVE`, ``, `Reviewed by ${who}. Facts match the research; tone is consistent.`].join("\n");
  }

  if (prompt.expectedOutput?.format === "html") {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Landing draft</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; color: #2b2118; background: #fbf6ef; }
  header { padding: 64px 24px; text-align: center; background: #6f4e37; color: #fff; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 24px; }
  .cta { display: inline-block; padding: 12px 20px; background: #e9a23b; color: #2b2118; border-radius: 6px; text-decoration: none; }
</style>
</head>
<body>
<header>
  <h1>Your neighbourhood coffee, done right</h1>
  <p>Draft landing page generated by ${escapeHtml(who)} — mock runtime.</p>
  <a class="cta" href="#visit">Visit us</a>
</header>
<main>
  <h2>Why us</h2>
  <ul><li>Fresh roasts every week</li><li>Fair prices, local suppliers</li><li>A table for every regular</li></ul>
  <h2 id="visit">Visit</h2>
  <p>Opening soon. (Mock content — replace with a real run.)</p>
</main>
</body>
</html>
`;
  }

  const role = opts.role.toLowerCase();
  const heading = `# ${prompt.meta.nodeLabel || opts.role}`;
  const intro = `_Mock output by ${who}, attempt ${prompt.meta.attempt}._\n\nTask: ${goal}`;
  let body: string;
  if (role.includes("research")) {
    body = `## Findings\n- Competitor A: specialty café, flat white around $5.\n- Competitor B: chain, drip coffee around $3.\n- Gap: mid-price, community-focused space with seating.\n\n## Pricing\n- Suggested range: $3.50–$5.00 for core drinks.`;
  } else if (role.includes("writ") || role.includes("copy") || role.includes("content")) {
    body = `## Positioning\nThe neighbourhood's living room: specialty coffee at fair prices.\n\n## Tagline\n"Good coffee, close to home."\n\n## Copy\nStop in for a $4 flat white and stay for the conversation.`;
  } else if (role.includes("ceo") || role.includes("lead") || role.includes("manager")) {
    body = `## Final launch brief\n1. Market: mid-price gap between specialty and chain cafés.\n2. Positioning: the neighbourhood's living room.\n3. Pricing: $3.50–$5.00.\n4. Assets: landing page draft attached (landing.html).\n5. Next steps: confirm the lease, then a soft-open week.`;
  } else if (role.includes("dev") || role.includes("engineer")) {
    body = `## Implementation notes\n- Static page, no build step.\n- Accessible colour contrast.\n- Opening hours as a placeholder.`;
  } else {
    body = `## Result\nCompleted the step. (Mock content.)`;
  }
  return `${heading}\n\n${intro}\n\n${body}\n`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
