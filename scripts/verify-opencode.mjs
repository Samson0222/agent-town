#!/usr/bin/env node
// Milestone 0 — verify the local OpenCode setup BEFORE any OpenCode adapter code is written.
// Cross-platform (Windows / macOS / Linux). Run from the repo root:
//
//   npm run verify:opencode                     free: version, models, config, provider names
//   npm run verify:opencode -- --serve          free: + `opencode serve` on 127.0.0.1 and an SDK session (no prompt)
//   npm run verify:opencode -- --serve --smoke  SPENDS a little credit: + one tiny prompt via CLI and via SDK
//
// Output goes to the terminal and to m0-opencode-report.txt (git-ignored).
// Secrets are redacted, but READ THE REPORT before pasting it anywhere.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir, platform, release, arch } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const SERVE = args.has("--serve");
const SMOKE = args.has("--smoke");
const WIN = platform() === "win32";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = join(ROOT, "m0-opencode-report.txt");
const M0 = join(ROOT, ".m0");

writeFileSync(REPORT, "");
const log = (s = "") => {
  console.log(s);
  appendFileSync(REPORT, s + "\n");
};
const section = (s) => log(`\n== ${s} ==`);

export function redact(text) {
  return String(text)
    .replace(/("?[A-Za-z0-9_]*(?:key|token|secret|password|auth)[A-Za-z0-9_]*"?\s*[:=]\s*)"?[^",\s}]+"?/gi, '$1"***"')
    .replace(/(sk-|pk-|ghp_|gho_|github_pat_|xox[bap]-)[A-Za-z0-9_-]{6,}/g, "$1***")
    // Account / org identifiers are not secrets, but keep them out of shared reports.
    .replace(/\b(org|acct|user)_[A-Za-z0-9]{8,}\b/g, "$1_***");
}

/** Run a command; shell:true so Windows .cmd shims (opencode.cmd, npm.cmd) resolve. */
function run(cmd, cmdArgs, opts = {}) {
  const line = [cmd, ...cmdArgs].join(" ");
  const r = spawnSync(line, { shell: true, encoding: "utf8", timeout: opts.timeout ?? 120000, cwd: opts.cwd ?? ROOT, env: opts.env ?? process.env });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim(), error: r.error };
}

log("Agent Town — Milestone 0 OpenCode report");
log(`date: ${new Date().toISOString()}`);
log(`os: ${platform()} ${release()} ${arch()}`);
log(`node: ${process.version}`);
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) log("WARNING: Agent Town needs Node 22.13+ (built-in SQLite). Please upgrade Node.");

const ver = run("opencode", ["--version"]);
if (ver.code !== 0) {
  log("opencode: NOT FOUND (or failed). Install OpenCode and make sure `opencode --version` works in this terminal, then re-run.");
  log(redact(ver.out));
  process.exit(1);
}

section("opencode --version");
const VERSION = ver.out.split(/\r?\n/).pop();
log(VERSION);
const semver = (VERSION.match(/\d+\.\d+\.\d+/) ?? [""])[0];
const MAJOR = Number((VERSION.match(/\d+/) ?? ["0"])[0]);
log(MAJOR >= 2
  ? "NOTE: OpenCode 2.x — the adapter targets @opencode/client (HTTP client for `opencode serve`), not @opencode-ai/sdk v1."
  : "NOTE: OpenCode 1.x — the adapter will target @opencode-ai/sdk pinned to this version.");

section("opencode models");
log(redact(run("opencode", ["models"]).out));

section("opencode debug config (redacted)");
log(redact(run("opencode", ["debug", "config"]).out));

section("subscription / provider setup (names only, never values)");
log(`OPENCODE_API_KEY: ${process.env.OPENCODE_API_KEY ? "set (Zen pay-per-use gateway likely)" : "not set"}`);
const authCandidates = [
  process.env.XDG_DATA_HOME && join(process.env.XDG_DATA_HOME, "opencode", "auth.json"),
  join(homedir(), ".local", "share", "opencode", "auth.json"),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "opencode", "auth.json"),
  process.env.APPDATA && join(process.env.APPDATA, "opencode", "auth.json"),
].filter(Boolean);
const authFile = authCandidates.find((p) => existsSync(p));
if (authFile) {
  log(`auth file found at: ${authFile}`);
  try {
    const a = JSON.parse(readFileSync(authFile, "utf8"));
    for (const [k, v] of Object.entries(a)) log(`provider: ${k} (type: ${v?.type ?? "?"})`);
  } catch (e) {
    log(`could not parse auth file: ${e.message}`);
  }
} else {
  log(`auth file not found (looked in: ${authCandidates.join(" | ")})`);
}
log("(Agent Town never copies auth.json or prints its values; this only lists provider names.)");

if (SMOKE) {
  section("opencode run smoke test (spends a little credit)");
  const r = run("opencode", ["run", '"Reply with exactly: AGENT_TOWN_OK"'], { timeout: 180000 });
  log(redact(r.out.split(/\r?\n/).slice(-20).join("\n")));
}

if (SERVE) {
  section("opencode serve + SDK session (localhost only)");
  mkdirSync(M0, { recursive: true });
  const PORT = 4096;
  const env = { ...process.env, OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD || randomBytes(12).toString("hex") };
  const serveLog = [];
  const child = spawn(`opencode serve --hostname 127.0.0.1 --port ${PORT}`, { shell: true, env, cwd: ROOT });
  child.stdout.on("data", (d) => serveLog.push(String(d)));
  child.stderr.on("data", (d) => serveLog.push(String(d)));
  const stopServe = () => {
    if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: true });
    else child.kill("SIGTERM");
  };
  process.on("exit", stopServe);

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`);
      up = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  log(`serve reachable on 127.0.0.1:${PORT}: ${up}`);

  if (up) {
    // 2.x: @opencode/client is the HTTP client for `opencode serve` (@opencode/sdk is an in-process host).
    const pkg = MAJOR >= 2 ? `@opencode/client@${semver}` : `@opencode-ai/sdk@${semver}`;
    log(`installing ${pkg} into .m0/ (not saved to the project's package.json)`);
    // Install *inside* .m0 (its own tiny package.json) instead of using --prefix:
    // simpler quoting on Windows and works the same across npm versions.
    writeFileSync(join(M0, "package.json"), JSON.stringify({ name: "agent-town-m0", private: true }, null, 2));
    const tail = (r) => redact(r.out.split(/\r?\n/).filter((l) => l.trim()).slice(-12).join("\n"));
    let inst = run("npm", ["install", "--no-audit", "--no-fund", pkg], { cwd: M0, timeout: 300000 });
    if (inst.code !== 0) {
      log(`npm install ${pkg} failed (exit ${inst.code}${inst.error ? `, ${inst.error.message}` : ""}):`);
      log(tail(inst));
      const fallback = MAJOR >= 2 ? "@opencode/client" : "@opencode-ai/sdk";
      log(`trying ${fallback} (latest) instead`);
      inst = run("npm", ["install", "--no-audit", "--no-fund", fallback], { cwd: M0, timeout: 300000 });
      if (inst.code !== 0) {
        log(`npm install ${fallback} failed too (exit ${inst.code}${inst.error ? `, ${inst.error.message}` : ""}):`);
        log(tail(inst));
      }
    }
    if (inst.code === 0) log(`installed: ${run("npm", ["ls", "--depth=0"], { cwd: M0 }).out.split(/\r?\n/).filter((l) => l.includes("@opencode")).join(", ")}`);
    // The check script must live next to .m0/node_modules so imports resolve there.
    copyFileSync(join(ROOT, "scripts", "opencode-sdk-check.mjs"), join(M0, "opencode-sdk-check.mjs"));
    const check = run("node", ["opencode-sdk-check.mjs"], {
      cwd: M0,
      timeout: 240000,
      env: { ...env, OPENCODE_URL: `http://127.0.0.1:${PORT}`, M0_PROMPT: SMOKE ? "1" : "0", M0_DIRECTORY: ROOT },
    });
    log(redact(check.out) || "(the SDK check printed nothing)");
    if (check.code !== 0) log(`SDK check exited with code ${check.code}${check.error ? ` (${check.error.message})` : ""}`);
  }
  log("serve log (tail):");
  log(redact(serveLog.join("").split(/\r?\n/).slice(-15).join("\n")));
  stopServe();
}

log("");
log(`Report written to ${REPORT} — review it, then paste it into the chat.`);
process.exit(0);
