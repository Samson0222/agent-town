import { describe, expect, it } from "vitest";
import {
  PlanError,
  Team,
  mainAgentTemplate,
  parsePlan,
  planToSteps,
  planWorkflow,
  plannerPrompt,
  practicePlan,
  reduceRunState,
  resolveTeam,
  singleStepWorkflow,
  starterTemplates,
  validateWorkflowGraph,
  type AgentTownEvent,
} from "../src";
import { ConnectorRegistry, MemoryVault, MockAdapter, MockChatConnector, MockWebConnector, RuntimeAdapterRegistry, VaultConnector, WorkflowEngine } from "../src/engine";

const launch = starterTemplates().find((t) => t.id === "launch-brief")!;
const main = mainAgentTemplate({ id: "launch-team", name: "Launch" });
const team = resolveTeam(
  Team.parse({ ...launch.team, memberIds: launch.team.agents.map((a) => a.id), agents: [], mainAgentId: main.id }),
  [...launch.team.agents, main],
);

function engine() {
  const vault = new MemoryVault();
  const events: AgentTownEvent[] = [];
  const e = new WorkflowEngine({
    adapters: new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: 0 })),
    connectors: new ConnectorRegistry().register(new VaultConnector(vault)).register(new MockChatConnector(vault)).register(new MockWebConnector()),
    vault,
    onEvent: (ev) => events.push(ev),
  });
  return { e, events };
}
const finished = (events: AgentTownEvent[]) => events.some((ev) => ev.type.startsWith("run.") && ["run.completed", "run.failed", "run.stopped"].includes(ev.type));
const until = async (f: () => boolean) => {
  for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe("main agent plans", () => {
  it("puts the main agent first in the office but never in the plan roster", () => {
    expect(team.agents[0]!.id).toBe(main.id);
    const prompt = plannerPrompt({ request: "Launch a bakery", team });
    expect(prompt).not.toContain(`${main.id} |`);
    expect(prompt).toContain("researcher | Riley");
  });

  it("the practice planner gives a small, predictable plan that passes the checks", () => {
    const prompt = plannerPrompt({ request: "Launch a bakery", team });
    const a = practicePlan(prompt);
    expect(a).toEqual(practicePlan(prompt));
    expect(a.steps.length).toBe(2);
    expect(a.steps[1]!.after).toEqual([1]);
    expect(a.steps[1]!.reviewBy).toBe("reviewer");
    const parsed = parsePlan("ok\n```plan\n" + JSON.stringify(a) + "\n```", team);
    expect(parsed.steps).toHaveLength(2);
  });

  it("rejects plans that name strangers or the future", () => {
    const bad = (steps: unknown) => () => parsePlan("```plan\n" + JSON.stringify({ reply: "x", steps }) + "\n```", team);
    expect(bad([{ who: "nobody", title: "a", what: "b" }])).toThrow(PlanError);
    expect(bad([{ who: main.id, title: "a", what: "b" }])).toThrow(PlanError);
    expect(bad([{ who: "writer", title: "a", what: "b", after: [2] }, { who: "writer", title: "c", what: "d" }])).toThrow(PlanError);
    expect(() => parsePlan("no plan here", team)).toThrow(PlanError);
  });

  it("reads plans the way real models write them", () => {
    const sloppy = { reply: "ok", steps: [{ who: " writer ", title: "x".repeat(200), what: "Write", after: "1", reviewBy: "", needsApproval: "true", outputFile: "my file?.md" }] };
    const bare = `Sure! Here is the plan:\n${JSON.stringify(sloppy)}\nLet me know.`;
    const p = parsePlan(bare, team);
    expect(p.steps[0]).toMatchObject({ who: "writer", needsApproval: true });
    expect(p.steps[0]!.title).toHaveLength(80);
    expect(p.steps[0]!.reviewBy).toBeUndefined();
    expect(p.steps[0]!.outputFile).toBeUndefined();
    expect(parsePlan("```JSON\r\n" + JSON.stringify({ steps: [] }) + "\r\n```", team).steps).toEqual([]);
    const many = { steps: Array.from({ length: 9 }, () => ({ who: "writer", title: "t", what: "w" })) };
    expect(() => parsePlan(JSON.stringify(many), team)).toThrow(PlanError);
  });

  it("runs side by side when steps wait for the same step, and ends with the main agent", () => {
    const plan = parsePlan(
      "```plan\n" +
        JSON.stringify({
          reply: "x",
          steps: [
            { who: "researcher", title: "Research", what: "r {{nodes.x.output}}" },
            { who: "writer", title: "Copy", what: "c", after: [1] },
            { who: "developer", title: "Page", what: "p", after: [1] },
          ],
        }) +
        "\n```",
      team,
    );
    const steps = planToSteps(plan, team, "Launch");
    expect(steps.map((s) => s.parallelWithPrevious)).toEqual([false, false, true, false]);
    expect(steps.at(-1)!.who).toBe(main.id);
    expect(steps[0]!.what).not.toContain("{{");
    const wf = planWorkflow({ id: "plan-1", name: "Plan #1", team, request: "Launch", steps });
    expect(validateWorkflowGraph(wf).filter((i) => i.level === "error")).toEqual([]);
  });

  it("gives a squad step to each member, then the lead", () => {
    const t = Team.parse({ ...team, squads: [{ id: "words", name: "Words squad", leadId: "writer", memberIds: ["writer", "reviewer"] }] });
    const plan = parsePlan("```plan\n" + JSON.stringify({ steps: [{ who: "squad:words", title: "Copy", what: "c" }] }) + "\n```", t);
    const steps = planToSteps(plan, t, "x");
    expect(steps.map((s) => s.who)).toEqual(["reviewer", "writer", main.id]);
  });

  it("the practice planner routes to a squad named in the request, then to someone outside it", () => {
    const t = Team.parse({ ...team, squads: [{ id: "words", name: "Words squad", leadId: "writer", memberIds: ["writer", "reviewer"] }] });
    const plan = practicePlan(plannerPrompt({ request: "Ask the Words squad for a tagline", team: t }));
    expect(plan.steps[0]!.who).toBe("squad:words");
    expect(["writer", "reviewer"]).not.toContain(plan.steps[1]!.who);
    expect(() => parsePlan("```plan\n" + JSON.stringify(plan) + "\n```", t)).not.toThrow();
  });

  it("puts a teammate named in the request first (Request work)", () => {
    const plan = practicePlan(plannerPrompt({ request: "For Casey: write the summary", team }));
    expect(plan.steps[0]!.who).toBe("ceo");
  });

  it("plans, runs and combines on the practice runtime end to end", async () => {
    const { e, events } = engine();
    const plan1 = singleStepWorkflow({ id: "plan-x", name: "Planning", teamId: team.id, agentId: main.id, label: "Plan", prompt: plannerPrompt({ request: "Launch a bakery", team }) });
    await e.start(plan1, team, {});
    await until(() => finished(events));
    const out = reduceRunState(events).nodes["answer"]!.output!;
    const plan = parsePlan(out, team);
    const wf = planWorkflow({ id: "plan-y", name: "Plan", team, request: "Launch a bakery", steps: planToSteps(plan, team, "Launch a bakery") });
    events.length = 0;
    await e.start(wf, team, { goal: "Launch a bakery" });
    await until(() => finished(events));
    const st = reduceRunState(events);
    expect(st.status).toBe("completed");
    const reply = st.nodes["s-combine"]!.output!;
    expect(reply).toContain("Here's what the team came up with");
    expect(reply).toContain("Researcher: first pass");
  });
});
