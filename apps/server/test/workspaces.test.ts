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
