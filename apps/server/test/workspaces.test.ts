import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

let server: Server;
let base = "";
let dir = "";

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent-town-ws-"));
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

const api = async (path: string, init?: { method?: string; json?: unknown }) => {
  const res = await fetch(base + path, {
    method: init?.method ?? (init?.json === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" },
    body: init?.json === undefined ? undefined : JSON.stringify(init.json),
  });
  return { status: res.status, body: (await res.json()) as any };
};

describe("workspaces", () => {
  it("every seeded team is a workspace with a main agent that leads its office", async () => {
    const teams = (await api("/api/teams")).body;
    for (const t of teams) {
      expect(t.mainAgentId).toBeTruthy();
      expect(t.agents[0].id).toBe(t.mainAgentId);
      expect(t.memberIds).not.toContain(t.mainAgentId);
      expect(t.officeStyle).toBe("2d");
    }
    const agents = (await api("/api/agents")).body;
    expect(agents.find((a: any) => a.id === teams[0].mainAgentId).mainOf).toBe(teams[0].id);
  });

  it("creates a workspace from a template with its name, goal and office style", async () => {
    const r = await api("/api/templates/launch-brief/instantiate", { json: { name: "Bakery launch", goal: "Open a bakery", officeStyle: "3d" } });
    expect(r.status).toBe(200);
    expect(r.body.team.name).toBe("Bakery launch");
    expect(r.body.team.goal).toBe("Open a bakery");
    expect(r.body.team.officeStyle).toBe("3d");
    expect(r.body.team.mainAgentId).toBeTruthy();
    expect(r.body.workflow.teamId).toBe(r.body.team.id);
  });

  it("creates a custom workspace from picked agents and keeps the main agent out of the members", async () => {
    const lib = (await api("/api/agents")).body.filter((a: any) => !a.mainOf);
    const r = await api("/api/workspaces", { json: { name: "Mine", goal: "g", memberIds: [lib[0].id, lib[1].id] } });
    expect(r.status).toBe(200);
    expect(r.body.memberIds).toEqual([lib[0].id, lib[1].id]);
    expect(r.body.agents).toHaveLength(3);
    // Saving it back keeps the same main agent.
    const again = await api(`/api/teams/${r.body.id}`, { method: "PUT", json: { ...r.body, mainAgentId: "someone-else", memberIds: [...r.body.memberIds, r.body.mainAgentId] } });
    expect(again.body.mainAgentId).toBe(r.body.mainAgentId);
    expect(again.body.memberIds).not.toContain(r.body.mainAgentId);
    expect((await api(`/api/agents/${r.body.mainAgentId}`, { method: "DELETE" })).status).toBe(409);
    expect((await api("/api/workspaces", { json: { name: "x", memberIds: ["nope"] } })).status).toBe(400);
  });

  it("reports usage and an inbox", async () => {
    const u = await api("/api/usage");
    expect(u.status).toBe(200);
    expect(u.body).toHaveProperty("byDay");
    const inbox = await api("/api/inbox");
    expect(Array.isArray(inbox.body)).toBe(true);
    expect((await api("/api/inbox/dismiss", { json: { id: "plan:x" } })).status).toBe(400);
  });
});

const until = async (f: () => Promise<boolean>, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("timed out");
};

describe("main agent", () => {
  it("chat → plan → Run plan → combined reply, all on the practice runtime", async () => {
    const ws = (await api("/api/templates/launch-brief/instantiate", { json: { name: "Plans" } })).body.team;
    const main = ws.mainAgentId;
    const sent = await api(`/api/workspaces/${ws.id}/chat/${main}`, { json: { text: "Plan a bakery opening" } });
    expect(sent.status).toBe(200);
    const planId = sent.body.plan.id;
    await until(async () => (await api(`/api/plans/${planId}`)).body.status === "proposed");
    const plan = (await api(`/api/plans/${planId}`)).body;
    expect(plan.number).toBe(1);
    expect(plan.steps.length).toBe(3); // two steps + combine
    expect(plan.steps.at(-1).who).toBe(main);
    expect((await api("/api/inbox")).body.some((i: any) => i.planId === planId)).toBe(true);

    const ran = await api(`/api/plans/${planId}/run`, { method: "POST" });
    expect(ran.status).toBe(200);
    expect((await api(`/api/plans/${planId}/run`, { method: "POST" })).status).toBe(409);
    await until(async () => (await api(`/api/plans/${planId}`)).body.status === "done", 15000);
    const done = (await api(`/api/plans/${planId}`)).body;
    expect(done.done).toBe(done.total);
    expect(done.reply).toContain("Here's what the team came up with");
    const thread = (await api(`/api/workspaces/${ws.id}/chat/${main}`)).body.messages;
    expect(thread.map((m: any) => m.role)).toEqual(["person", "agent", "agent"]);
    // planning runs stay out of the Runs list; the plan's run is in it
    const runs = (await api(`/api/runs?teamId=${ws.id}`)).body;
    expect(runs).toHaveLength(1);
    expect(runs[0].workflowName).toMatch(/^Plan #1/);
    const history = (await api(`/api/workspaces/${ws.id}/agents/researcher-${ws.id.split("-").pop()}/history`)).body;
    expect(history.length).toBeGreaterThan(0);
  });

  it("auto-runs plans when the workspace allows it, and cancels", async () => {
    const ws = (await api("/api/templates/content-post/instantiate", { json: { name: "Auto" } })).body.team;
    await api(`/api/teams/${ws.id}`, { method: "PUT", json: { ...ws, autoRun: true } });
    const sent = await api(`/api/workspaces/${ws.id}/chat/${ws.mainAgentId}`, { json: { text: "Write a post about tea" } });
    const planId = sent.body.plan.id;
    await until(async () => ["running", "done"].includes((await api(`/api/plans/${planId}`)).body.status));
    const p = (await api(`/api/plans/${planId}`)).body;
    if (p.status === "running") {
      expect((await api(`/api/plans/${planId}/cancel`, { method: "POST" })).status).toBe(200);
      await until(async () => (await api(`/api/plans/${planId}`)).body.status === "cancelled");
    }
  });

  it("answers a direct question from a sub-agent without starting work", async () => {
    const ws = (await api("/api/teams")).body.find((t: any) => t.id === "launch-team");
    const agent = ws.memberIds[0];
    const r = await api(`/api/workspaces/${ws.id}/chat/${agent}`, { json: { text: "What do you know about prices?" } });
    expect(r.status).toBe(200);
    await until(async () => (await api(`/api/workspaces/${ws.id}/chat/${agent}`)).body.messages.length === 2);
    const t = (await api(`/api/workspaces/${ws.id}/chat/${agent}`)).body;
    expect(t.waiting).toBe(false);
    expect(t.messages[1].text).toContain("Practice reply");
    expect((await api(`/api/workspaces/${ws.id}/chat/nobody`, { json: { text: "hi" } })).status).toBe(404);
  });
});
