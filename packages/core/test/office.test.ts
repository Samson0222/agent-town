import { describe, expect, it } from "vitest";
import { isSimulatedRun, officeActivity, officeMeetings, officeStatus, parseWorkflow, reduceRunState, starterTemplates, syncSimpleWorkflow, type AgentTownEvent } from "../src";
import { ConnectorRegistry, MemoryVault, MockAdapter, RuntimeAdapterRegistry, VaultConnector, WorkflowEngine } from "../src/engine";

describe("office helpers", () => {
  it("names what each person is doing from status + tool", () => {
    expect(officeActivity("working", "shell.run")).toBe("terminal");
    expect(officeActivity("working", "web.fetch")).toBe("browsing");
    expect(officeActivity("working", "vault.read")).toBe("reading");
    expect(officeActivity("working", "vault.write")).toBe("coding");
    expect(officeActivity("working")).toBe("working");
    expect(officeActivity("waiting-for-human")).toBe("needs-you");
    expect(officeActivity("failed")).toBe("error");
  });

  it("a reviewer checking a draft meets the writer; the meeting ends with the review", async () => {
    const team = starterTemplates().find((t) => t.id === "launch-brief")!.team;
    const wf = syncSimpleWorkflow(
      parseWorkflow({
        schemaVersion: 1,
        id: "w",
        name: "W",
        teamId: team.id,
        inputs: [{ key: "goal", default: "Coffee" }],
        nodes: [],
        edges: [],
        simple: { steps: [{ id: "copy", title: "Copy", who: "writer", what: "Write a tagline.", reviewBy: "reviewer" }] },
      }),
    );
    const vault = new MemoryVault();
    const engine = new WorkflowEngine({
      adapters: new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: 0 })),
      connectors: new ConnectorRegistry().register(new VaultConnector(vault)),
      vault,
    });
    const run = await engine.start(wf, team, {});
    const seen: string[] = [];
    run.subscribe((_ev: AgentTownEvent) => {
      for (const [a, b] of officeMeetings(reduceRunState(run.events))) seen.push(`${a}+${b}`);
    });
    expect(await run.done).toBe("completed");
    expect(seen).toContain("reviewer+writer");
    const end = reduceRunState(run.events);
    expect(officeMeetings(end)).toEqual([]);
    expect(isSimulatedRun(end)).toBe(true);
    // a run stopped mid-step: nobody keeps "working" or meeting in the office
    const stopped = { ...end, status: "stopped" as const };
    expect(officeStatus(stopped, "thinking")).toBe("idle");
    expect(officeStatus(stopped, "done")).toBe("done");
  });
});
