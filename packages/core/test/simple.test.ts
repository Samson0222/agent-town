import { describe, expect, it } from "vitest";
import { buildGraphFromSteps, parseWorkflow, reduceRunState, starterTemplates, syncSimpleWorkflow, validateWorkflowGraph, type AgentTownEvent } from "../src";
import { ConnectorRegistry, MemoryVault, MockAdapter, MockChatConnector, MockWebConnector, RuntimeAdapterRegistry, VaultConnector, WorkflowEngine } from "../src/engine";

const launch = () => starterTemplates().find((t) => t.id === "launch-brief")!;

const simpleLaunch = () =>
  syncSimpleWorkflow(
    parseWorkflow({
      schemaVersion: 1,
      id: "simple-launch",
      name: "Simple launch",
      teamId: "launch-team",
      inputs: [{ key: "goal", label: "Goal", type: "longtext", default: "Launch a coffee shop" }],
      nodes: [],
      edges: [],
      simple: {
        steps: [
          { id: "research", title: "Research", who: "researcher", what: "Find competitors and prices." },
          { id: "copy", title: "Write copy", who: "writer", what: "Write positioning and a tagline.", reviewBy: "reviewer", needsApproval: true },
          { id: "landing", title: "Landing page", who: "developer", what: "Build a one-page landing draft.", outputFile: "landing.html" },
          { id: "channels", title: "Channels", who: "researcher", what: "List launch channels.", parallelWithPrevious: true },
          { id: "brief", title: "Final brief", who: "ceo", what: "Merge everything into a brief.", outputFile: "launch-brief.md" },
        ],
      },
    }),
  );

describe("step-list workflows", () => {
  it("generates a valid graph with review loop, approval and parallel stage", () => {
    const wf = simpleLaunch();
    expect(validateWorkflowGraph(wf).filter((i) => i.level === "error")).toEqual([]);
    const types = wf.nodes.map((n) => n.type);
    expect(types.filter((t) => t === "agentTask")).toHaveLength(6); // 5 steps + 1 reviewer
    expect(types).toContain("branch");
    expect(types).toContain("humanApproval");
    expect(types).toContain("parallel");
    expect(types).toContain("merge");
    expect(types.at(-1)).toBe("end");
    const prompt = wf.nodes.find((n) => n.id === "s-research")!;
    expect(prompt.type === "agentTask" && prompt.config.prompt).toMatch(/^Goal: \{\{input.goal\}\}/);
  });

  it("is deterministic", () => {
    const steps = simpleLaunch().simple!.steps;
    expect(buildGraphFromSteps(steps, { goalKey: "goal" })).toEqual(buildGraphFromSteps(steps, { goalKey: "goal" }));
  });

  it("runs end-to-end in mock mode: review sends work back once, then approval, parallel, final files", async () => {
    const vault = new MemoryVault();
    const engine = new WorkflowEngine({
      adapters: new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: 0 })),
      connectors: new ConnectorRegistry().register(new VaultConnector(vault)).register(new MockChatConnector(vault)).register(new MockWebConnector()),
      vault,
    });
    const run = await engine.start(simpleLaunch(), launch().team, {});
    run.subscribe((ev: AgentTownEvent) => ev.type === "approval.requested" && queueMicrotask(() => run.approve(ev.approvalId, true)));
    expect(await run.done).toBe("completed");
    const s = reduceRunState(run.events);
    expect(s.nodes["s-copy"]!.attempts).toBe(2); // reviewer rejected the first draft
    expect(s.files).toEqual(expect.arrayContaining(["landing.html", "launch-brief.md"]));
    expect(await vault.readFile(run.id, "landing.html")).toMatch(/<!doctype html>/i);
  });

  it("graph workflows are untouched by sync", () => {
    const wf = launch().workflow;
    expect(syncSimpleWorkflow(wf)).toBe(wf);
  });
});
