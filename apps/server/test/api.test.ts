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
