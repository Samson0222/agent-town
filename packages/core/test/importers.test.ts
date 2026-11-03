import { describe, expect, it } from "vitest";
import { importAgentFactoryTemplate, reduceRunState, starterTemplates } from "../src";
import { ConnectorRegistry, MemoryVault, MockAdapter, MockWebConnector, RuntimeAdapterRegistry, VaultConnector, MockChatConnector, WorkflowEngine } from "../src/engine";

describe("Agent Factory template importer (format only)", () => {
  const files = {
    "template.json": JSON.stringify({
      id: "pm",
      name: "Project Manager",
      description: "Breaks work down",
      emoji: "📋",
      group: "dev",
      defaults: { model: "some/model", skills: ["task-api"], peers: ["ceo"] },
    }),
    "IDENTITY.md": "I keep projects on track.",
    "SOUL.md": "1. Be transparent.",
  };

  it("maps template.json + markdown into an AgentTemplate", () => {
    const { agent, notes } = importAgentFactoryTemplate(files, { knownModel: () => false, color: "#123456" });
    expect(agent).toMatchObject({ id: "pm", name: "Project Manager", department: "dev", emoji: "📋", group: "dev", tools: [] });
    expect(agent.systemPrompt).toContain("I keep projects on track.");
    expect(agent.systemPrompt).toContain("Be transparent.");
    expect(agent.model).toBeUndefined();
    expect(agent.appearance.color).toBe("#123456");
    expect(notes.join(" ")).toMatch(/Model "some\/model"/);
    expect(notes.join(" ")).toMatch(/Peers were ignored/);
  });

  it("keeps the model when the runtime knows it", () => {
    expect(importAgentFactoryTemplate(files, { knownModel: (m) => m === "some/model" }).agent.model).toEqual({ id: "some/model" });
  });

  it("rejects a template without id/name", () => {
    expect(() => importAgentFactoryTemplate({ "template.json": "{}" })).toThrow(/id/);
  });
});

describe("reducer extras (OpenClaw Office pattern)", () => {
  it("tracks tokens per agent and the tool in use", async () => {
    const vault = new MemoryVault();
    const engine = new WorkflowEngine({
      adapters: new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: 0 })),
      connectors: new ConnectorRegistry().register(new VaultConnector(vault)).register(new MockChatConnector(vault)).register(new MockWebConnector()),
      vault,
    });
    const t = starterTemplates().find((x) => x.id === "launch-brief")!;
    const run = await engine.start(t.workflow, t.team, {});
    run.subscribe((ev) => ev.type === "approval.requested" && queueMicrotask(() => run.approve(ev.approvalId, true)));
    await run.done;
    const s = reduceRunState(run.events);
    expect(s.cost.tokens).toBeGreaterThan(0);
    expect(s.agents.researcher!.tokens).toBeGreaterThan(0);
    // Mid-run, the researcher was seen using its search tool
    const mid = reduceRunState(run.events, run.events.find((e) => e.type === "tool.call" && e.from === "researcher")!.seq);
    expect(mid.agents.researcher!.currentTool).toBe("mock-web.search");
    // ...and nobody is "using" a tool after the run
    for (const a of Object.values(s.agents)) expect(a.currentTool).toBeUndefined();
  });
});
