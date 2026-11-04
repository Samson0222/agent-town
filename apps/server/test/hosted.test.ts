import { createServer, type Server } from "node:http";
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { AccessVerifier } from "../src/auth";

/** A fake Cloudflare Access: our own RSA key, published as the team's JWKS. No network. */
const TEAM = "devsam.cloudflareaccess.com";
const AUD = "aud-tag-123";
const ORIGIN = "https://agents.devsam.my";
const OWNER = "owner@example.com";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };

function jwt(claims: Record<string, unknown>, key: KeyObject = privateKey, kid = "k1") {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: now + 600, iat: now, ...claims })).toString("base64url");
  return `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url")}`;
}

let tunnel: Server;
let local: Server;
let tBase = "";
let lBase = "";
let dir = "";
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent-town-hosted-"));
  app = createApp({
    dbFile: join(dir, "t.db"),
    vaultDir: join(dir, "vault"),
    mockStepMs: 0,
    access: { verifier: new AccessVerifier({ teamDomain: TEAM, audience: AUD, fetchKeys: async () => [jwk] }), ownerEmail: OWNER, publicOrigin: ORIGIN },
  });
  tunnel = createServer((q, r) => void app.handleTunnel(q, r));
  local = createServer((q, r) => void app.handle(q, r));
  await new Promise<void>((r) => tunnel.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => local.listen(0, "127.0.0.1", r));
  const port = (s: Server) => {
    const a = s.address();
    return typeof a === "object" && a ? a.port : 0;
  };
  tBase = `http://127.0.0.1:${port(tunnel)}`;
  lBase = `http://127.0.0.1:${port(local)}`;
});
afterAll(() => {
  tunnel.close();
  local.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = async (path: string, opts: { token?: string; method?: string; json?: unknown; origin?: string | null; base?: string; headers?: Record<string, string> } = {}) => {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  if (opts.token) headers["Cf-Access-Jwt-Assertion"] = opts.token;
  if (opts.origin !== null && opts.method && opts.method !== "GET") headers.Origin = opts.origin ?? ORIGIN;
  const res = await fetch((opts.base ?? tBase) + path, { method: opts.method ?? "GET", headers, body: opts.json === undefined ? undefined : JSON.stringify(opts.json) });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};
const as = (email: string) => jwt({ email });

describe("hosted access: the login", () => {
  it("refuses requests without a login, with a forged, expired or wrong-audience token", async () => {
    expect((await call("/api/teams")).status).toBe(401);
    expect((await call("/api/teams", { token: jwt({ email: OWNER }, other.privateKey) })).status).toBe(401); // signed by someone else
    expect((await call("/api/teams", { token: jwt({ email: OWNER, exp: Math.floor(Date.now() / 1000) - 3600 }) })).status).toBe(401);
    expect((await call("/api/teams", { token: jwt({ email: OWNER, aud: ["someone-else"] }) })).status).toBe(401);
    expect((await call("/api/teams", { token: jwt({ email: OWNER, iss: "https://evil.cloudflareaccess.com" }) })).status).toBe(401);
    expect((await call("/api/teams", { token: jwt({ email: OWNER }, privateKey, "unknown-kid") })).status).toBe(401);
    // tampered payload: swap the email but keep the owner's signature
    const [h, , s] = as("viewer@example.com").split(".");
    const p = Buffer.from(JSON.stringify({ iss: `https://${TEAM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email: OWNER })).toString("base64url");
    expect((await call("/api/teams", { token: `${h}.${p}.${s}` })).status).toBe(401);
  });

  it("a valid login that wasn't invited gets a clear 'ask the owner' answer", async () => {
    const r = await call("/api/teams", { token: as("stranger@example.com") });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/not invited/);
  });

  it("the owner is recognised (emails are case-insensitive)", async () => {
    const r = await call("/api/me", { token: as("Owner@Example.com") });
    expect(r.body).toMatchObject({ email: OWNER, role: "owner", local: false, hosted: true });
  });

  it("the local port refuses anything that came through Cloudflare", async () => {
    expect((await call("/api/teams", { base: lBase, token: as(OWNER) })).status).toBe(403);
    expect((await call("/api/teams", { base: lBase, headers: { "CF-Connecting-IP": "1.2.3.4" } })).status).toBe(403);
    expect((await call("/api/me", { base: lBase })).body).toMatchObject({ role: "owner", local: true });
  });
});

describe("hosted access: roles", () => {
  it("only the owner manages people", async () => {
    const owner = as(OWNER);
    expect((await call("/api/people", { token: owner, method: "POST", json: { email: "op@example.com", role: "operator", dailyBudgetUsd: 0.5 } })).status).toBe(200);
    expect((await call("/api/people", { token: owner, method: "POST", json: { email: "viewer@example.com", role: "viewer" } })).status).toBe(200);
    expect((await call("/api/people", { token: owner, method: "POST", json: { email: "x@example.com", role: "owner" } })).status).toBe(400);
    const list = (await call("/api/people", { token: owner })).body as Array<{ email: string; role: string }>;
    expect(list.map((x) => `${x.email}:${x.role}`)).toEqual([`${OWNER}:owner`, "op@example.com:operator", "viewer@example.com:viewer"]);
    expect((await call("/api/people", { token: as("op@example.com") })).status).toBe(403);
    expect((await call("/api/people", { token: as("op@example.com"), method: "POST", json: { email: "y@example.com", role: "viewer" } })).status).toBe(403);
  });

  it("a viewer can look but not change or run anything", async () => {
    const v = as("viewer@example.com");
    expect((await call("/api/teams", { token: v })).status).toBe(200);
    expect((await call("/api/agents", { token: v, method: "POST", json: { name: "Nope" } })).status).toBe(403);
    expect((await call("/api/runs", { token: v, method: "POST", json: { workflowId: "launch-brief", inputs: { goal: "x" } } })).status).toBe(403);
  });

  it("an operator can build and run; the run records who started it", async () => {
    const op = as("op@example.com");
    expect((await call("/api/agents", { token: op, method: "POST", json: { name: "Nova" } })).status).toBe(200);
    const r = await call("/api/runs", { token: op, method: "POST", json: { workflowId: "launch-brief", inputs: { goal: "Coffee" } } });
    expect(r.status).toBe(200);
    const run = (await call(`/api/runs/${r.body.runId}`, { token: op })).body;
    expect(run.run.startedBy).toBe("op@example.com");
    expect(run.events.find((e: any) => e.type === "run.started").actor).toBe("op@example.com");
    await call(`/api/runs/${r.body.runId}/stop`, { token: op, method: "POST" });
  });

  it("mutating requests must come from the Agent Town page", async () => {
    const owner = as(OWNER);
    expect((await call("/api/agents", { token: owner, method: "POST", json: { name: "X" }, origin: "https://evil.example" })).status).toBe(403);
    expect((await call("/api/agents", { token: owner, method: "POST", json: { name: "X" }, origin: null })).status).toBe(403);
  });

  it("send / spend approvals are the owner's only", async () => {
    // Find a run waiting on a send approval: the launch brief's 'share' step is a gated send.
    const owner = as(OWNER);
    const start = await call("/api/runs", { token: owner, method: "POST", json: { workflowId: "launch-brief", inputs: { goal: "Coffee" } } });
    const id = start.body.runId as string;
    let approval: any;
    for (let i = 0; i < 200 && !approval; i++) {
      const s = (await call(`/api/runs/${id}`, { token: owner })).body.state;
      for (const a of Object.values(s.approvals) as any[]) {
        if (a.resolved) continue;
        if (a.category === "send" || a.category === "spend") approval = a;
        else await call(`/api/runs/${id}/approve`, { token: owner, method: "POST", json: { approvalId: a.approvalId, approved: true } });
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(approval).toBeTruthy();
    const op = await call(`/api/runs/${id}/approve`, { token: as("op@example.com"), method: "POST", json: { approvalId: approval.approvalId, approved: true } });
    expect(op.status).toBe(403);
    const ok = await call(`/api/runs/${id}/approve`, { token: owner, method: "POST", json: { approvalId: approval.approvalId, approved: true } });
    expect(ok.status).toBe(200);
    const ev = (await call(`/api/runs/${id}`, { token: owner })).body.events.find((e: any) => e.type === "approval.resolved" && e.approvalId === approval.approvalId);
    expect(ev.actor).toBe(OWNER);
  });

  it("outside agents report through the tunnel with a Cloudflare service token plus their bot token", async () => {
    const owner = as(OWNER);
    const { token } = (await call("/api/teams/content-team/reporters", { token: owner, method: "POST", json: { name: "Grok bot" } })).body;
    const report = (headers: Record<string, string>) =>
      fetch(tBase + "/api/report", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ status: "thinking", summary: "Planning a thread" }) });
    expect((await report({ Authorization: `Bearer ${token}` })).status).toBe(401); // no Cloudflare login
    const service = jwt({ common_name: "abc123.access" });
    expect((await report({ Authorization: `Bearer ${token}`, "Cf-Access-Jwt-Assertion": service })).status).toBe(204);
    // a service token alone is not a person: it can't use the rest of the API
    expect((await call("/api/teams", { token: service })).status).toBe(401);
    // only the owner adds outside agents
    expect((await call("/api/teams/content-team/reporters", { token: as("op@example.com"), method: "POST", json: { name: "x" } })).status).toBe(403);
  });

  it("operators can't start real-credit runs past their daily budget", async () => {
    // Pretend the operator already spent their budget today.
    app.store.db.prepare("UPDATE runs SET cost_usd = 1 WHERE started_by = 'op@example.com'").run();
    // Make the launch team spend credit: register a fake spending runtime and point the team at it.
    app.adapters.register({
      manifest: { id: "paid", name: "Paid", version: "1", kind: "cli", capabilities: [], spendsCredit: true },
    } as never);
    const team = (await call("/api/teams/launch-team", { token: as(OWNER) })).body;
    await call("/api/teams/launch-team", { token: as(OWNER), method: "PUT", json: { ...team, defaults: { ...team.defaults, runtime: "paid" } } });
    const r = await call("/api/runs", { token: as("op@example.com"), method: "POST", json: { workflowId: "launch-brief", inputs: { goal: "x" } } });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/budget/);
  });
});

describe("hosted access: invites per workspace", () => {
  const GUEST = "guest@example.com";
  it("lets someone invited to one workspace see and use that workspace only", async () => {
    const owner = as(OWNER);
    const teams = (await call("/api/teams", { token: owner })).body;
    const launch = teams.find((t: any) => t.id === "launch-team");
    const other = teams.find((t: any) => t.id !== "launch-team");
    expect((await call("/api/teams", { token: as(GUEST) })).status).toBe(403);
    const put = await call(`/api/teams/${launch.id}`, { token: owner, method: "PUT", json: { ...launch, agents: [], access: [{ email: "Guest@Example.com", role: "operator", dailyBudgetUsd: 0 }] } });
    expect(put.status).toBe(200);
    expect(put.body.access[0].email).toBe(GUEST);

    const guest = as(GUEST);
    const mine = (await call("/api/teams", { token: guest })).body;
    expect(mine.map((t: any) => t.id)).toEqual([launch.id]);
    expect((await call("/api/me", { token: guest })).body.scope[launch.id].role).toBe("operator");
    expect((await call(`/api/teams/${other.id}`, { token: guest })).status).toBe(403);
    expect((await call(`/api/workspaces/${other.id}/plans`, { token: guest })).status).toBe(403);
    expect((await call("/api/runs", { token: guest })).body.every((r: any) => r.teamId === launch.id)).toBe(true);
    expect((await call("/api/workflows", { token: guest })).body.every((w: any) => w.teamId === launch.id)).toBe(true);
    // can work in their workspace
    expect((await call(`/api/workspaces/${launch.id}/chat/${launch.mainAgentId}`, { token: guest, method: "POST", json: { text: "Plan a tasting day" } })).status).toBe(200);
    // but not elsewhere, and not on shared things
    const otherWf = (await call("/api/workflows", { token: owner })).body.find((w: any) => w.teamId === other.id);
    expect((await call("/api/runs", { token: guest, method: "POST", json: { workflowId: otherWf.id } })).status).toBe(403);
    expect((await call("/api/agents", { token: guest, method: "POST", json: { name: "Sneaky" } })).status).toBe(403);
    expect((await call("/api/workspaces", { token: guest, method: "POST", json: { name: "Mine" } })).status).toBe(403);
    expect((await call("/api/usage", { token: guest })).status).toBe(403);
    expect((await call(`/api/usage?teamId=${launch.id}`, { token: guest })).status).toBe(200);
    // and can't invite anyone
    const self = (await call(`/api/teams/${launch.id}`, { token: guest })).body;
    const tried = await call(`/api/teams/${launch.id}`, { token: guest, method: "PUT", json: { ...self, agents: [], access: [...self.access, { email: "friend@example.com", role: "operator" }] } });
    expect(tried.status).toBe(200);
    expect(tried.body.access).toHaveLength(1);
  });

  it("checks squads", async () => {
    const owner = as(OWNER);
    const t = (await call("/api/teams/launch-team", { token: owner })).body;
    const bad = await call(`/api/teams/${t.id}`, { token: owner, method: "PUT", json: { ...t, agents: [], squads: [{ id: "x", name: "X", leadId: "nobody", memberIds: [t.memberIds[0]] }] } });
    expect(bad.status).toBe(400);
    const ok = await call(`/api/teams/${t.id}`, { token: owner, method: "PUT", json: { ...t, agents: [], squads: [{ id: "words", name: "Words", leadId: t.memberIds[1], memberIds: [t.memberIds[1], t.memberIds[3]] }] } });
    expect(ok.status).toBe(200);
    // squad members sit together, right after the main agent
    expect(ok.body.agents.slice(1, 3).map((a: any) => a.id)).toEqual([t.memberIds[1], t.memberIds[3]]);
  });
});
