import { describe, expect, it } from "vitest";
import {
  parseWorkflow,
  reduceRunState,
  starterTemplates,
  Team,
  type AgentTownEvent,
  type RuntimeAdapter,
  type Workflow,
} from "../src";
import {
  ConnectorRegistry,
  MemoryVault,
  MockAdapter,
  MockChatConnector,
  MockWebConnector,
  RuntimeAdapterRegistry,
  VaultConnector,
  WorkflowEngine,
  PreflightError,
  type Run,
} from "../src/engine";

function setup(adapterOverrides: RuntimeAdapter[] = []) {
  const vault = new MemoryVault();
  const adapters = new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: 0 }));
  for (const a of adapterOverrides) adapters.register(a);
  const connectors = new ConnectorRegistry()
    .register(new VaultConnector(vault))
    .register(new MockChatConnector(vault))
    .register(new MockWebConnector());
  const engine = new WorkflowEngine({ adapters, connectors, vault });
  return { vault, adapters, connectors, engine };
}

const launch = () => starterTemplates().find((t) => t.id === "launch-brief")!;

/** Auto-answer approvals as they arrive. */
function autoApprove(run: Run, decide: (ev: Extract<AgentTownEvent, { type: "approval.requested" }>) => boolean = () => true) {
  run.subscribe((ev) => {
    if (ev.type === "approval.requested") queueMicrotask(() => run.approve(ev.approvalId, decide(ev)));
  });
}

describe("workflow schema v1", () => {
  it("round-trips starter workflows through JSON", () => {
    for (const t of starterTemplates()) {
      const again = parseWorkflow(JSON.parse(JSON.stringify(t.workflow)));
      expect(again).toEqual(t.workflow);
    }
  });

  it("rejects an unknown schema version", () => {
    expect(() => parseWorkflow({ ...launch().workflow, schemaVersion: 2 })).toThrow(/schemaVersion/);
  });
});

describe("engine — launch brief demo in mock mode", () => {
  it("runs end-to-end with a review rejection, approvals and saved files", async () => {
    const { engine, vault } = setup();
    const { team, workflow } = launch();
    const run = await engine.start(workflow, team, { goal: "Create a launch brief for a new neighbourhood coffee shop." });
    autoApprove(run);
    const status = await run.done;
    expect(status).toBe("completed");

    const state = reduceRunState(run.events);
    expect(state.status).toBe("completed");
    // Reviewer rejected once, so the writer ran twice
    expect(state.nodes.copy!.attempts).toBe(2);
    expect(state.nodes.review!.attempts).toBe(2);
    expect(run.events.some((e) => e.type === "message" && e.kind === "feedback")).toBe(true);
    // At least 2 deliverables
    expect(state.files).toEqual(expect.arrayContaining(["landing.html", "launch-brief.md", "outbox.md"]));
    expect(await vault.readFile(run.id, "landing.html")).toMatch(/<!doctype html>/i);
    // Cost visible (simulated)
    expect(state.cost.total).toBeGreaterThan(0);
    expect(state.cost.simulated).toBe(true);
    // All tasks finished
    for (const t of Object.values(state.tasks)) expect(t.stage).toBe("done");
    // Nobody is still "working" after the run
    for (const a of Object.values(state.agents)) expect(["idle", "done"]).toContain(a.status);
  });

  it("every agent's on-screen status equals its last agent.status event", async () => {
    const { engine } = setup();
    const { team, workflow } = launch();
    const run = await engine.start(workflow, team, {});
    autoApprove(run);
    await run.done;
    const state = reduceRunState(run.events);
    for (const a of Object.values(state.agents)) {
      const last = [...run.events].reverse().find((e) => e.type === "agent.status" && e.from === a.id);
      expect(last && last.type === "agent.status" ? last.status : "idle").toBe(a.status);
    }
  });

  it("send tool never runs without approval; rejection skips it", async () => {
    const { engine, vault } = setup();
    const { team, workflow } = launch();
    const run = await engine.start(workflow, team, {});
    autoApprove(run, (ev) => ev.kind !== "tool");
    expect(await run.done).toBe("completed");
    expect(await vault.readFile(run.id, "outbox.md")).toBeUndefined();
    expect(run.events.some((e) => e.type === "tool.result" && e.tool === "mock-chat.send_message" && !e.ok)).toBe(true);
  });

  it("registry refuses send tools without an approval token", async () => {
    const { connectors } = setup();
    const res = await connectors.execute("mock-chat.send_message", { text: "hi" }, { runId: "r", nodeId: "n" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/approval/);
  });

  it("stops when the cost cap is exceeded", async () => {
    const { engine } = setup();
    const { team, workflow } = launch();
    const capped: Workflow = { ...workflow, settings: { ...workflow.settings, costCapUsd: 0.000001 } };
    const run = await engine.start(capped, team, {});
    autoApprove(run);
    expect(await run.done).toBe("stopped");
    const state = reduceRunState(run.events);
    expect(state.endReason).toMatch(/Cost cap/);
  });

  it("pauses, reassigns a task, and resumes", async () => {
    const { engine } = setup();
    const { team, workflow } = launch();
    const run = await engine.start(workflow, team, {});
    let reassigned = false;
    run.subscribe((ev) => {
      // When the human sign-off is requested: pause, reassign the channels task, resume, approve.
      if (ev.type === "approval.requested" && ev.kind === "node" && !reassigned) {
        reassigned = true;
        queueMicrotask(async () => {
          run.pause();
          await run.reassign("channels", "writer");
          run.redirect("channels", "Focus on walkable neighbourhood partners.");
          run.resume();
          run.approve(ev.approvalId, true);
        });
      } else if (ev.type === "approval.requested") {
        queueMicrotask(() => run.approve(ev.approvalId, true));
      }
    });
    expect(await run.done).toBe("completed");
    const state = reduceRunState(run.events);
    expect(state.nodes.channels!.agentId).toBe("writer");
    expect(state.tasks["task:channels"]!.assignee).toBe("writer");
    expect(run.events.map((e) => e.type)).toEqual(expect.arrayContaining(["run.paused", "task.reassigned", "task.redirected", "run.resumed"]));
  });

  it("fails the run cleanly when a step fails", async () => {
    const { engine } = setup();
    const { team, workflow } = launch();
    const broken = parseWorkflow({
      ...workflow,
      nodes: workflow.nodes.map((n) => (n.id === "research" && n.type === "agentTask" ? { ...n, config: { ...n.config, prompt: "[mock:fail]" } } : n)),
    });
    const run = await engine.start(broken, team, {});
    expect(await run.done).toBe("failed");
    const state = reduceRunState(run.events);
    expect(state.nodes.research!.status).toBe("failed");
    expect(state.agents.researcher!.status).toBe("failed");
  });
});

describe("preflight — capability checks before a run", () => {
  it("blocks a node whose runtime lacks a required capability", async () => {
    const limited = new MockAdapter({ stepMs: 0 });
    // A second "runtime" with fewer capabilities, registered under another id.
    Object.assign(limited, { manifest: { ...limited.manifest, id: "limited", capabilities: ["streaming"] } });
    limited.listCapabilities = async () => ["streaming"];
    const { engine } = setup([limited]);
    const { workflow } = launch();
    const team = Team.parse({
      ...launch().team,
      agents: launch().team.agents.map((a) => (a.id === "developer" ? { ...a, runtime: "limited" } : a)),
    });
    const pf = await engine.preflight(workflow, team, {});
    expect(pf.ok).toBe(false);
    expect(pf.issues.some((i) => i.level === "error" && /fileEdit/.test(i.message))).toBe(true);
    expect(pf.issues.some((i) => i.level === "warning" && /cost/.test(i.message))).toBe(true);
    await expect(engine.start(workflow, team, {})).rejects.toBeInstanceOf(PreflightError);
  });

  it("blocks a tool call the agent is not allowed to use", async () => {
    const { engine } = setup();
    const team = Team.parse({ ...launch().team, agents: launch().team.agents.map((a) => (a.id === "ceo" ? { ...a, tools: [] } : a)) });
    const pf = await engine.preflight(launch().workflow, team, {});
    expect(pf.issues.some((i) => i.level === "error" && /not allowed/.test(i.message))).toBe(true);
  });
});

describe("other starter templates run in mock mode", () => {
  for (const t of starterTemplates().filter((t) => t.id !== "launch-brief")) {
    it(t.name, async () => {
      const { engine } = setup();
      const run = await engine.start(t.workflow, t.team, {});
      autoApprove(run);
      expect(await run.done).toBe("completed");
    });
  }
});
