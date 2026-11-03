import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunState } from "@agent-town/core";
import { createApp } from "../src/app";

let server: Server;
let base = "";
let dir = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent-town-"));
  const app = createApp({ dbFile: join(dir, "t.db"), vaultDir: join(dir, "vault"), mockStepMs: 0 });
  server = createServer((q, r) => void app.handle(q, r));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const api = async (path: string, init?: RequestInit & { json?: unknown }) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json" },
    body: init?.json === undefined ? undefined : JSON.stringify(init.json),
  });
  return { status: res.status, body: (await res.json()) as any };
};

describe("API", () => {
  it("seeds starter teams and workflows", async () => {
    const teams = await api("/api/teams");
    expect(teams.body.map((t: any) => t.id)).toContain("launch-team");
    const wfs = await api("/api/workflows");
    expect(wfs.body.map((w: any) => w.id)).toContain("launch-brief");
  });

  it("creates, edits, clones and deletes a team and workflow without code changes", async () => {
    const team = (await api("/api/teams", { method: "POST", json: { name: "My team" } })).body;
    team.agents.push({ id: "solo", name: "Solo", role: "Writer" });
    const saved = await api(`/api/teams/${team.id}`, { method: "PUT", json: team });
    expect(saved.status).toBe(200);
    expect(saved.body.agents[0].appearance.color).toBeTruthy();

    const wf = (await api("/api/workflows", { method: "POST", json: { teamId: team.id, name: "Mine" } })).body;
    wf.nodes.unshift({ id: "a", type: "agentTask", label: "Write", config: { agentId: "solo", prompt: "{{input.goal}}" } });
    wf.edges.push({ id: "e", source: "a", target: "end" });
    const put = await api(`/api/workflows/${wf.id}`, { method: "PUT", json: wf });
    expect(put.status).toBe(200);
    expect(put.body.workflow.revision).toBe(2);

    const exported = (await api(`/api/workflows/${wf.id}/export`)).body;
    const imported = await api("/api/workflows/import", { method: "POST", json: exported });
    expect(imported.status).toBe(200);
    expect(imported.body.workflow.id).not.toBe(wf.id);

    const clone = await api(`/api/teams/${team.id}/clone`, { method: "POST" });
    expect(clone.body.name).toMatch(/copy/);
    expect((await api(`/api/teams/${team.id}`, { method: "DELETE" })).status).toBe(409);
    expect((await api(`/api/teams/${team.id}?force=1`, { method: "DELETE" })).status).toBe(200);
  });

  it("rejects invalid workflow JSON", async () => {
    const r = await api("/api/workflows/import", { method: "POST", json: { schemaVersion: 1, id: "x" } });
    expect(r.status).toBe(400);
  });

  it("runs the launch brief demo via the API with approvals", async () => {
    const start = await api("/api/runs", { method: "POST", json: { workflowId: "launch-brief", inputs: {} } });
    expect(start.status).toBe(200);
    const runId = start.body.runId as string;
    let state: RunState | undefined;
    for (let i = 0; i < 200; i++) {
      const r = await api(`/api/runs/${runId}`);
      state = r.body.state;
      const pending = Object.values(state!.approvals).filter((a) => !a.resolved);
      for (const a of pending) await api(`/api/runs/${runId}/approve`, { method: "POST", json: { approvalId: a.approvalId, approved: true } });
      if (["completed", "failed", "stopped"].includes(state!.status)) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(state!.status).toBe("completed");
    const files = (await api(`/api/runs/${runId}/files`)).body;
    expect(files).toEqual(expect.arrayContaining(["landing.html", "launch-brief.md"]));
    const html = await fetch(`${base}/api/runs/${runId}/files/landing.html`);
    expect(html.headers.get("content-type")).toMatch(/text\/plain/);
  });

  it("refuses non-localhost origins", async () => {
    const res = await fetch(base + "/api/teams", { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });
});

describe("vault layout + step runs + Agent Factory import", () => {
  it("writes run outputs under <team vault>/04-OUTPUTS and records step runs", async () => {
    const fs = await import("node:fs");
    const start = await api("/api/runs", { method: "POST", json: { workflowId: "content-post", inputs: {} } });
    const runId = start.body.runId as string;
    let detail: any;
    for (let i = 0; i < 200; i++) {
      detail = (await api(`/api/runs/${runId}`)).body;
      if (detail.state.status === "completed") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(detail.state.status).toBe("completed");
    expect(detail.vaultDir).toMatch(/^content-team\/04-OUTPUTS\/\d{4}-\d{2}-\d{2}-content-team-blog-post-/);
    expect(fs.existsSync(join(dir, "vault", "content-team", "00-INBOX"))).toBe(true);
    expect(fs.existsSync(join(dir, "vault", detail.vaultDir, "post.md"))).toBe(true);
    const steps = (await api(`/api/runs/${runId}/steps`)).body;
    expect(steps.find((s: any) => s.node_id === "draft" && s.attempt === 2)?.status).toBe("success");
    expect(steps.find((s: any) => s.node_id === "draft").tokens).toBeGreaterThan(0);
    const summary = join(dir, "vault", detail.vaultDir, "_run.md");
    const read = () => (fs.existsSync(summary) ? fs.readFileSync(summary, "utf8") : "");
    for (let i = 0; i < 200 && !read().includes("## Files"); i++) await new Promise((r) => setTimeout(r, 10));
    expect(read()).toMatch(/^---\nrun: /);
  });

  it("imports Agent Factory templates into a team", async () => {
    const r = await api("/api/teams/content-team/import/agent-factory", {
      method: "POST",
      json: { templates: [{ "template.json": JSON.stringify({ id: "copy-editor", name: "Copy Chief", defaults: { model: "mock/fast" } }), "SOUL.md": "Be kind." }] },
    });
    expect(r.status).toBe(200);
    expect(r.body.imported[0].id).toBe("copy-editor-2"); // "copy-editor" already exists in the library
    const added = r.body.team.agents.find((a: any) => a.id === "copy-editor-2");
    expect(added.model).toEqual({ id: "mock/fast" });
    expect(added.systemPrompt).toContain("Be kind.");
  });
});

describe("shared agent library", () => {
  it("lists library agents with their teams, and teams resolve members", async () => {
    const agents = (await api("/api/agents")).body;
    const riley = agents.find((a: any) => a.id === "researcher");
    expect(riley.teams.map((t: any) => t.id)).toContain("launch-team");
    const team = (await api("/api/teams/launch-team")).body;
    expect(team.memberIds).toContain("researcher");
    expect(team.agents.find((a: any) => a.id === "researcher").name).toBe("Riley");
  });

  it("creates an agent, adds it to a team, edits it everywhere at once", async () => {
    const a = (await api("/api/agents", { method: "POST", json: { name: "Nova", role: "Analyst", teamId: "sprint-team" } })).body;
    expect((await api("/api/teams/sprint-team")).body.memberIds).toContain(a.id);
    await api(`/api/agents/${a.id}`, { method: "PUT", json: { ...a, systemPrompt: "Be brief." } });
    const team = (await api("/api/teams/sprint-team")).body;
    expect(team.agents.find((x: any) => x.id === a.id).systemPrompt).toBe("Be brief.");
    // removing from a team keeps the agent in the library
    await api("/api/teams/sprint-team", { method: "PUT", json: { ...team, memberIds: team.memberIds.filter((m: string) => m !== a.id) } });
    expect((await api(`/api/agents/${a.id}`)).status).toBe(200);
    expect((await api(`/api/agents/${a.id}`, { method: "DELETE" })).status).toBe(200);
  });

  it("refuses to delete an agent a workflow still uses", async () => {
    const r = await api("/api/agents/researcher", { method: "DELETE" });
    expect(r.status).toBe(409);
  });

  it("template copies get their own agents", async () => {
    const r = (await api("/api/templates/launch-brief/instantiate", { method: "POST" })).body;
    expect(r.team.memberIds).not.toContain("researcher");
    const step = r.workflow.nodes.find((n: any) => n.id === "research");
    expect(r.team.memberIds).toContain(step.config.agentId);
  });

  it("migrates a team that still embeds agents (legacy), renaming clashes", async () => {
    const legacy = {
      id: "legacy-team",
      name: "Legacy",
      agents: [
        { id: "researcher", name: "Someone Else", role: "Researcher" }, // clashes with launch-team's Riley
        { id: "solo-x", name: "Solo", role: "Writer" },
      ],
    };
    const t = (await api("/api/teams", { method: "POST", json: legacy })).body;
    expect(t.memberIds).toEqual(["researcher-legacy-team", "solo-x"]);
    expect((await api("/api/agents/researcher")).body.agent.name).toBe("Riley");
  });
});

describe("skills library API", () => {
  it("installs a starter skill for specific agents and shows it on their pages", async () => {
    const s = (await api("/api/skill-starters/fact-check-checklist/install", { method: "POST", json: { scope: "agents", agentIds: ["reviewer"] } })).body;
    const detail = (await api(`/api/skills/${s.id}`)).body;
    expect(detail.agents.find((a: any) => a.id === "reviewer").on).toBe(true);
    expect(detail.agents.find((a: any) => a.id === "writer").on).toBe(false);
    const team = (await api("/api/teams/launch-team")).body;
    expect(team.skills.map((x: any) => x.id)).toContain(s.id);
  });

  it("global skills apply to everyone and can be switched off per agent", async () => {
    const s = (await api("/api/skills", { method: "POST", json: { skill: { name: "House style", content: "Be brief." }, scope: "global" } })).body;
    expect(s.scope).toBe("global");
    let detail = (await api(`/api/skills/${s.id}`)).body;
    expect(detail.agents.every((a: any) => a.on)).toBe(true);
    detail = (await api(`/api/skills/${s.id}`, { method: "PUT", json: { assign: { developer: false } } })).body;
    expect(detail.agents.find((a: any) => a.id === "developer").on).toBe(false);
    expect((await api("/api/agents/developer")).body.agent.skills).toContainEqual({ skillId: s.id, enabled: false });
  });

  it("imports skill folders", async () => {
    const r = (await api("/api/skills/import", { method: "POST", json: { folders: [{ files: { "SKILL.md": "---\nname: Checklist\n---\n- [ ] one", "tool.sh": "echo hi" } }], scope: "agents", agentIds: ["writer"] } })).body;
    expect(r.created[0].name).toBe("Checklist");
    expect(r.warnings.join(" ")).toMatch(/never runs/);
  });

  it("deleting a skill removes it from agents", async () => {
    const s = (await api("/api/skills", { method: "POST", json: { skill: { name: "Temp" }, scope: "agents", agentIds: ["ceo"] } })).body;
    await api(`/api/skills/${s.id}`, { method: "DELETE" });
    expect((await api("/api/agents/ceo")).body.agent.skills.some((r: any) => r.skillId === s.id)).toBe(false);
  });
});
