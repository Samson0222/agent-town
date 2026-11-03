import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OpenCodeClientLike } from "@agent-town/adapter-opencode";
import { createApp } from "../src/app";

// A fake OpenCode client: models only (no prompts are sent in this test, nothing is spent).
const fake: OpenCodeClientLike = {
  session: {
    create: async () => ({ id: "ses_x" }),
    prompt: async () => ({}),
    interrupt: async () => ({}),
    get: async () => ({ id: "ses_x", cost: 0, tokens: { input: 0, output: 0 } }),
  },
  model: { list: async () => ({ data: [{ id: "kimi-k3", providerID: "opencode-go", name: "Kimi K3", enabled: true }] }) },
  event: { subscribe: () => ({ async *[Symbol.asyncIterator]() {} }) },
};

let server: Server;
let base = "";
let dir = "";
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agent-town-oc-"));
  const app = createApp({ dbFile: join(dir, "t.db"), vaultDir: join(dir, "vault"), mockStepMs: 0, opencode: { client: fake, directory: dir } });
  server = createServer((q, r) => void app.handle(q, r));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("OpenCode runtime registration", () => {
  it("is listed with its models when configured", async () => {
    const runtimes = (await (await fetch(`${base}/api/runtimes`)).json()) as any[];
    const oc = runtimes.find((r) => r.id === "opencode");
    expect(oc).toMatchObject({ name: "OpenCode", spendsCredit: true, runtimeVersion: "2.2.0" });
    expect(oc.models.map((m: any) => m.id)).toEqual(["opencode-go/kimi-k3"]);
  });

  it("preflight accepts an agent on OpenCode with a listed model", async () => {
    const team = (await (await fetch(`${base}/api/teams/launch-team`)).json()) as any;
    const pf = (await (
      await fetch(`${base}/api/workflows/launch-brief/preflight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    ).json()) as any;
    expect(pf.ok).toBe(true);
    expect(team.defaults.runtime).toBe("mock"); // nothing switches to OpenCode by itself
  });
});
