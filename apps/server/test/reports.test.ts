import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { cleanSummary, presence, STALE_MS } from "../src/reports";

let server: Server;
let base = "";
let dir = "";
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent-town-reports-"));
  app = createApp({ dbFile: join(dir, "t.db"), vaultDir: join(dir, "vault"), mockStepMs: 0 });
  server = createServer((q, r) => void app.handle(q, r));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("outside agents reporting in", () => {
  let token = "";
  let id = "";

  it("the owner adds an outside agent and gets its token once", async () => {
    const r = await (await post("/api/teams/launch-team/reporters", { name: "Codex", color: "#112233" })).json();
    expect(r.token).toMatch(/^atb_/);
    expect(r.reporter).toMatchObject({ name: "Codex", status: "idle" });
    token = r.token;
    id = r.reporter.id;
    // the token is never returned again, and only its hash is stored
    const list = await (await fetch(base + "/api/teams/launch-team/reporters")).json();
    expect(JSON.stringify(list)).not.toContain(token);
    const row = app.store.db.prepare("SELECT token_hash FROM reporters WHERE id = ?").get(id) as { token_hash: string };
    expect(row.token_hash).not.toContain(token);
  });

  it("a report with the token shows up in the office", async () => {
    const res = await post("/api/report", { status: "browsing", summary: "Fetching ETF flow data" }, { Authorization: `Bearer ${token}` });
    expect(res.status).toBe(204);
    const [bot] = await (await fetch(base + "/api/teams/launch-team/reporters")).json();
    expect(bot).toMatchObject({ report: "browsing", status: "working", tool: "web", summary: "Fetching ETF flow data" });
  });

  it("refuses bad tokens, unknown statuses, big bodies and floods", async () => {
    expect((await post("/api/report", { status: "coding" })).status).toBe(401);
    expect((await post("/api/report", { status: "coding" }, { Authorization: "Bearer atb_not-a-real-token-0000000" })).status).toBe(401);
    await new Promise((r) => setTimeout(r, 2100));
    expect((await post("/api/report", { status: "hacking" }, { Authorization: `Bearer ${token}` })).status).toBe(400);
    await new Promise((r) => setTimeout(r, 2100));
    expect((await post("/api/report", JSON.stringify({ status: "coding", summary: "x".repeat(5000) }), { Authorization: `Bearer ${token}` })).status).toBe(413);
    await new Promise((r) => setTimeout(r, 2100));
    expect((await post("/api/report", { status: "coding" }, { Authorization: `Bearer ${token}` })).status).toBe(204);
    expect((await post("/api/report", { status: "coding" }, { Authorization: `Bearer ${token}` })).status).toBe(429); // 1 per 2 s
  }, 15_000);

  it("rotating the token cuts off the old one; deleting removes the bot", async () => {
    const { token: fresh } = await (await post(`/api/reporters/${id}/token`, {})).json();
    await new Promise((r) => setTimeout(r, 2100));
    expect((await post("/api/report", { status: "idle" }, { Authorization: `Bearer ${token}` })).status).toBe(401);
    expect((await post("/api/report", { status: "idle" }, { Authorization: `Bearer ${fresh}` })).status).toBe(204);
    expect((await fetch(`${base}/api/reporters/${id}`, { method: "DELETE" })).status).toBe(200);
    expect(await (await fetch(base + "/api/teams/launch-team/reporters")).json()).toEqual([]);
  }, 10_000);

  it("cleans summaries and treats old reports as idle", () => {
    expect(cleanSummary("ok\u0000‮ <script>  done\n\nnext")).toBe("ok script done next");
    expect(cleanSummary("y".repeat(200))).toHaveLength(80);
    const old = presence({ id: "b", teamId: "t", name: "B", color: "#000000", sprite: "char-1", createdAt: "", status: "coding", summary: "busy", reportedAt: new Date(Date.now() - STALE_MS - 1000).toISOString() });
    expect(old).toMatchObject({ report: "idle", status: "idle", summary: undefined });
  });
});
