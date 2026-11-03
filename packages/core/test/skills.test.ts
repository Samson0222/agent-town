import { describe, expect, it } from "vitest";
import { Team, agentSkills, parseSkillMarkdown, starterSkills, starterTemplates, type AgentTownEvent } from "../src";
import { ConnectorRegistry, MemoryVault, MockAdapter, MockChatConnector, MockWebConnector, RuntimeAdapterRegistry, VaultConnector, WorkflowEngine } from "../src/engine";

const launch = () => starterTemplates().find((t) => t.id === "launch-brief")!;

describe("skills", () => {
  it("parses SKILL.md front matter", () => {
    const md = parseSkillMarkdown("---\nname: Review helper\ndescription: Use for reviews\n---\n# Steps\n1. Read");
    expect(md).toEqual({ name: "Review helper", description: "Use for reviews", body: "# Steps\n1. Read" });
    expect(parseSkillMarkdown("just text").body).toBe("just text");
  });

  it("global skills apply unless switched off; agent skills only when ticked", () => {
    const [factCheck, brandVoice] = [starterSkills().find((s) => s.id === "fact-check-checklist")!, starterSkills().find((s) => s.id === "brand-voice")!];
    const base = launch().team;
    const team = Team.parse({
      ...base,
      skills: [factCheck, brandVoice],
      agents: base.agents.map((a) =>
        a.id === "reviewer" ? { ...a, skills: [{ skillId: factCheck.id, enabled: true }] } : a.id === "developer" ? { ...a, skills: [{ skillId: brandVoice.id, enabled: false }] } : a,
      ),
    });
    const names = (id: string) => agentSkills(team, team.agents.find((a) => a.id === id)!).map((s) => s.name).sort();
    expect(names("reviewer")).toEqual(["Brand voice guide", "Fact-check checklist"]);
    expect(names("writer")).toEqual(["Brand voice guide"]);
    expect(names("developer")).toEqual([]);
  });

  it("puts active skills into the agent's prompt at run time", async () => {
    const factCheck = starterSkills().find((s) => s.id === "fact-check-checklist")!;
    const t = launch();
    const team = Team.parse({ ...t.team, skills: [factCheck], agents: t.team.agents.map((a) => (a.id === "reviewer" ? { ...a, skills: [{ skillId: factCheck.id, enabled: true }] } : a)) });
    const vault = new MemoryVault();
    const engine = new WorkflowEngine({
      adapters: new RuntimeAdapterRegistry().register(new MockAdapter({ stepMs: 0 })),
      connectors: new ConnectorRegistry().register(new VaultConnector(vault)).register(new MockChatConnector(vault)).register(new MockWebConnector()),
      vault,
    });
    const run = await engine.start(t.workflow, team, {});
    run.subscribe((ev: AgentTownEvent) => ev.type === "approval.requested" && queueMicrotask(() => run.approve(ev.approvalId, true)));
    await run.done;
    const loaded = run.events.filter((e) => e.type === "runtime.event" && e.kind === "skills.loaded");
    expect(loaded.every((e) => e.from === "reviewer")).toBe(true);
    expect(loaded.length).toBeGreaterThan(0);
    // The mock echoes skills it found in its instructions
    const review = run.events.find((e) => e.type === "node.completed" && e.nodeId === "review");
    expect(review && review.type === "node.completed" && review.output).toBeTruthy();
    const reviewStep = await vault.readFile(run.id, "steps/review-2.md");
    expect(reviewStep).toBeDefined();
    const research = await vault.readFile(run.id, "steps/research-1.md");
    expect(research).not.toMatch(/Applied skills/);
  });
});
