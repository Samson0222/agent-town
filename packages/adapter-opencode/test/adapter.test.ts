import { describe, expect, it } from "vitest";
import { Team, parseWorkflow, reduceRunState, type AgentTownEvent } from "@agent-town/core";
import { ConnectorRegistry, MemoryVault, MockAdapter, RuntimeAdapterRegistry, VaultConnector, WorkflowEngine } from "@agent-town/core/engine";
import { OpenCodeAdapter, createOpenCodeClient, splitModel, type OpenCodeClientLike, type OpenCodeEvent } from "../src";

/**
 * A fake `opencode serve` speaking the 2.2.0 event shapes (from @opencode/client
 * type definitions). Each prompt plays a script of events. No network, no spend.
 */
function fakeOpenCode(script: (sessionID: string, text: string) => OpenCodeEvent[]) {
  const listeners = new Set<(ev: OpenCodeEvent) => void>();
  const calls: Array<{ fn: string; input: any }> = [];
  let n = 0;
  const emit = (ev: OpenCodeEvent) => listeners.forEach((l) => l(ev));
  const client: OpenCodeClientLike = {
    session: {
      async create(input) {
        calls.push({ fn: "session.create", input });
        return { id: `ses_${++n}`, cost: 0, tokens: { input: 0, output: 0 } };
      },
      async prompt(input) {
        calls.push({ fn: "session.prompt", input });
        const evs = script(input.sessionID, input.text);
        setTimeout(() => evs.forEach(emit), 0);
        return {};
      },
      async interrupt(input) {
        calls.push({ fn: "session.interrupt", input });
        setTimeout(() => emit({ type: "session.execution.interrupted", data: { sessionID: input.sessionID, reason: "user" } }), 0);
      },
      async get(input) {
        return { id: input.sessionID, cost: 0.0123, tokens: { input: 100, output: 40, reasoning: 10 } };
      },
    },
    permission: {
      async reply(input) {
        calls.push({ fn: "permission.reply", input });
      },
    },
    model: {
      async list() {
        return {
          data: [
            { id: "kimi-k3", providerID: "opencode-go", name: "Kimi K3", enabled: true, status: "active" },
            { id: "~anthropic/claude-sonnet-latest", providerID: "openrouter", name: "Sonnet", enabled: true, status: "active" },
            { id: "old-model", providerID: "opencode", enabled: true, status: "deprecated" },
            { id: "off", providerID: "opencode", enabled: false },
          ],
        };
      },
    },
    event: {
      subscribe(opts) {
        const queue: OpenCodeEvent[] = [];
        let wake: (() => void) | null = null;
        const l = (ev: OpenCodeEvent) => {
          queue.push(ev);
          wake?.();
        };
        listeners.add(l);
        opts?.signal?.addEventListener("abort", () => {
          listeners.delete(l);
          wake?.();
        });
        return {
          async *[Symbol.asyncIterator]() {
            while (!opts?.signal?.aborted) {
              const ev = queue.shift();
              if (ev) yield ev;
              else await new Promise<void>((r) => (wake = r));
            }
          },
        };
      },
    },
  };
  return { client, calls, emit };
}

const happyScript = (sessionID: string): OpenCodeEvent[] => [
  { type: "session.execution.started", data: { sessionID } },
  { type: "session.reasoning.delta", data: { sessionID, delta: "hmm" } },
  { type: "session.tool.input.started", data: { sessionID, id: "t1", name: "read" } },
  { type: "session.tool.called", data: { sessionID, id: "t1", input: { path: "notes.md" } } },
  { type: "session.tool.success", data: { sessionID, id: "t1", content: [{ type: "text", text: "ok" }] } },
  { type: "session.text.delta", data: { sessionID, delta: "# Findings\n" } },
  { type: "session.text.delta", data: { sessionID, delta: "- Competitor A: $5 flat white" } },
  { type: "session.usage.updated", data: { sessionID, cost: 0.004, tokens: { input: 300, output: 50, reasoning: 10, cache: { read: 0, write: 0 } } } },
  { type: "session.usage.updated", data: { sessionID, cost: 0.006, tokens: { input: 300, output: 80, reasoning: 10, cache: { read: 0, write: 0 } } } },
  { type: "session.execution.succeeded", data: { sessionID } },
];

function setup(script = happyScript) {
  const fake = fakeOpenCode(script);
  const adapter = new OpenCodeAdapter({ client: fake.client, directory: "/work/project" });
  const vault = new MemoryVault();
  const engine = new WorkflowEngine({
    adapters: new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: 0 })).register(adapter),
    connectors: new ConnectorRegistry().register(new VaultConnector(vault)),
    vault,
  });
  const team = Team.parse({
    id: "t",
    name: "T",
    defaults: { runtime: "opencode", model: { id: "opencode-go/kimi-k3" }, costCapUsd: 1 },
    agents: [{ id: "riley", name: "Riley", role: "Researcher", systemPrompt: "Cite numbers.", permissions: { shell: false, autoApproveWrite: false } }],
  });
  const wf = parseWorkflow({
    schemaVersion: 1,
    id: "w",
    name: "W",
    teamId: "t",
    inputs: [{ key: "goal", default: "Coffee shop" }],
    nodes: [
      { id: "research", type: "agentTask", label: "Research", config: { agentId: "riley", prompt: "{{input.goal}}: find competitors", outputFile: "research.md" } },
      { id: "end", type: "end" },
    ],
    edges: [{ id: "e1", source: "research", target: "end" }],
  });
  return { fake, adapter, engine, team, wf, vault };
}

describe("OpenCode adapter (fake server, no spend)", () => {
  it("maps model ids", () => {
    expect(splitModel("opencode-go/kimi-k3")).toEqual({ providerID: "opencode-go", id: "kimi-k3" });
    expect(splitModel("openrouter/~anthropic/claude-sonnet-latest")).toEqual({ providerID: "openrouter", id: "~anthropic/claude-sonnet-latest" });
    expect(() => splitModel("kimi")).toThrow(/provider\/model/);
  });

  it("lists enabled, non-deprecated models as provider/model", async () => {
    const { adapter } = setup();
    expect((await adapter.listModels()).map((m) => m.id)).toEqual(["opencode-go/kimi-k3", "openrouter/~anthropic/claude-sonnet-latest"]);
  });

  it("runs a step end-to-end through the engine: tools, text, cost deltas, saved output", async () => {
    const { engine, team, wf, fake, vault, adapter } = setup();
    const run = await engine.start(wf, team, {});
    expect(await run.done).toBe("completed");
    const s = reduceRunState(run.events);
    // session created with the right model, directory, agent and every OpenCode tool denied
    const create = fake.calls.find((c) => c.fn === "session.create")!.input;
    expect(create).toMatchObject({ agent: "build", model: { providerID: "opencode-go", id: "kimi-k3" }, location: { directory: "/work/project" } });
    expect(create.permissions[0]).toEqual({ action: "*", resource: "*", effect: "deny" });
    expect(create.permissions.some((r: any) => r.action === "shell" && r.effect !== "deny")).toBe(false);
    // instructions + goal reached the prompt
    const prompt = fake.calls.find((c) => c.fn === "session.prompt")!.input.text as string;
    expect(prompt).toMatch(/## Your role and instructions[\s\S]*Cite numbers\.[\s\S]*Coffee shop: find competitors/);
    // tool + cost events
    expect(run.events.some((e) => e.type === "tool.call" && e.tool === "read")).toBe(true);
    expect(run.events.some((e) => e.type === "tool.result" && e.tool === "read" && e.ok)).toBe(true);
    expect(s.cost.total).toBeCloseTo(0.006, 6);
    expect(s.cost.simulated).toBe(false);
    expect(s.cost.tokens).toBe(300 + 90);
    expect(await vault.readFile(run.id, "research.md")).toBe("# Findings\n- Competitor A: $5 flat white");
    await adapter.dispose();
  });

  it("fails the run cleanly when OpenCode reports a failure", async () => {
    const { engine, team, wf, adapter } = setup((sessionID) => [
      { type: "session.execution.started", data: { sessionID } },
      { type: "session.execution.failed", data: { sessionID, error: { type: "provider", message: "rate limited" } } },
    ]);
    const run = await engine.start(wf, team, {});
    expect(await run.done).toBe("failed");
    expect(reduceRunState(run.events).error).toMatch(/rate limited/);
    await adapter.dispose();
  });

  it("Stop interrupts the OpenCode session", async () => {
    const { engine, team, wf, fake, adapter } = setup((sessionID) => [{ type: "session.execution.started", data: { sessionID } }]);
    const run = await engine.start(wf, team, {});
    await new Promise((r) => setTimeout(r, 20));
    await run.stop("test");
    expect(await run.done).toBe("stopped");
    await new Promise((r) => setTimeout(r, 10));
    expect(fake.calls.some((c) => c.fn === "session.interrupt")).toBe(true);
    await adapter.dispose();
  });

  it("asks OpenCode's permission questions in Agent Town and passes the answer back", async () => {
    const { engine, team, wf, fake, adapter } = setup((sessionID) => [
      { type: "session.execution.started", data: { sessionID } },
      { type: "permission.asked", data: { id: "p1", sessionID, action: "read", resources: [".env"] } },
    ]);
    const statuses: string[] = [];
    const run = await engine.start(wf, team, {});
    run.subscribe((ev: AgentTownEvent) => ev.type === "agent.status" && statuses.push(ev.status));
    await new Promise((r) => setTimeout(r, 30));
    expect(statuses).toContain("waiting-for-human");
    const pending = Object.values(reduceRunState(run.events).approvals).find((a) => !a.resolved)!;
    expect(pending).toMatchObject({ kind: "tool", category: "runtime", tool: "read" });
    run.approve(pending.approvalId, false, "not that file");
    await new Promise((r) => setTimeout(r, 10));
    const sid = fake.calls.find((c) => c.fn === "session.prompt")!.input.sessionID as string;
    expect(fake.calls.find((c) => c.fn === "permission.reply")!.input).toEqual({ sessionID: sid, requestID: "p1", decision: "reject", message: "not that file" });
    fake.emit({ type: "session.execution.succeeded", data: { sessionID: sid } });
    expect(await run.done).toBe("completed");
    await adapter.dispose();
  });

  it("gives shell back only as 'ask' to agents allowed to use it", async () => {
    const { sessionPermissions } = await import("../src");
    expect(sessionPermissions({ shell: true, autoApproveWrite: false })).toContainEqual({ action: "shell", resource: "*", effect: "ask" });
    expect(sessionPermissions({ shell: false, autoApproveWrite: false }).filter((r) => r.effect !== "deny")).toEqual([]);
  });

  it("only talks to localhost", async () => {
    await expect(createOpenCodeClient("http://example.com:4096")).rejects.toThrow(/localhost/);
  });

  it("declares the capabilities the engine checks", () => {
    const { adapter } = setup();
    expect(adapter.manifest).toMatchObject({ id: "opencode", runtimeVersion: "2.2.0", spendsCredit: true });
    expect(adapter.manifest.capabilities).toEqual(expect.arrayContaining(["streaming", "costReporting", "cancellation", "fileEdit", "toolUse"]));
    expect(adapter.manifest.capabilities).not.toContain("skills");
  });
});
