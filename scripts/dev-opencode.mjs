#!/usr/bin/env node
/**
 * Agent Town with the real OpenCode runtime (spends from your OpenCode / OpenRouter account).
 *
 *   npm run dev:opencode
 *
 * 1. Starts `opencode serve` on 127.0.0.1:4096 with a fresh random OPENCODE_SERVER_PASSWORD,
 *    in an empty scratch folder (data/opencode-work), never this project.
 * 2. Starts Agent Town (npm run dev) with the OpenCode runtime registered.
 * Ctrl+C stops both. Nothing here is reachable from outside this PC.
 *
 * Real runs only happen when a workspace (Settings → Defaults) or an agent uses the
 * "OpenCode" runtime. Everything else stays on the free practice runtime.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIN = process.platform === "win32";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.OPENCODE_PORT ?? 4096);
const WORK = resolve(process.env.AGENT_TOWN_WORKDIR ?? resolve(ROOT, "data", "opencode-work"));
mkdirSync(WORK, { recursive: true });
const password = process.env.OPENCODE_SERVER_PASSWORD || randomBytes(18).toString("base64url");
const auth = "Basic " + Buffer.from(`opencode:${password}`).toString("base64");

const kill = (p) => {
  if (!p || p.exitCode !== null) return;
  if (WIN) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore", shell: true });
  else p.kill("SIGTERM");
};

async function reachable() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

if (await reachable()) {
  console.error(`Something is already using 127.0.0.1:${PORT}. Close your own "opencode serve" first (or set OPENCODE_PORT).`);
  process.exit(1);
}

console.log(`[opencode] starting on 127.0.0.1:${PORT} in ${WORK}`);
const oc = spawn(`opencode serve --hostname 127.0.0.1 --port ${PORT}`, {
  shell: true,
  cwd: WORK,
  env: { ...process.env, OPENCODE_SERVER_PASSWORD: password },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const s of [oc.stdout, oc.stderr]) {
  s.setEncoding("utf8");
  s.on("data", (d) => d.split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[opencode] ${l.replaceAll(password, "***")}`)));
}

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (oc.exitCode !== null) break;
  up = await reachable();
}
if (!up) {
  console.error("[opencode] didn't start. Check that `opencode --version` works in this window.");
  kill(oc);
  process.exit(1);
}
console.log("[opencode] ready");

const app = spawn(process.execPath, [resolve(ROOT, "scripts", "dev.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, AGENT_TOWN_OPENCODE_URL: `http://127.0.0.1:${PORT}`, OPENCODE_SERVER_PASSWORD: password, AGENT_TOWN_WORKDIR: WORK },
});

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  kill(app);
  kill(oc);
  setTimeout(() => process.exit(0), 300);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("exit", stop);
oc.on("exit", () => {
  if (!stopping) console.error("[opencode] stopped unexpectedly");
  stop();
});
