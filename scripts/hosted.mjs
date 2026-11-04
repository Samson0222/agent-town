#!/usr/bin/env node
/**
 * Run Agent Town for hosted access (docs/hosting.md, docs/hosting-setup.md). Windows-friendly.
 *
 *   npm run hosted -- --init --owner you@example.com --team devsam --aud <AUD tag> --host agents.devsam.my
 *       saves data/hosting.json (git-ignored; holds no secrets)
 *   npm run hosted -- --cloudflared <tunnel-id>
 *       prints the cloudflared config for that tunnel
 *   npm run hosted
 *       builds the web app and starts it plus the API (local port 4317 + tunnel-only port 4318)
 *   npm run hosted -- --no-build
 *       starts without rebuilding
 *
 * Everything binds to 127.0.0.1. The public way in is the Cloudflare Tunnel you run yourself.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIN = process.platform === "win32";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = resolve(process.env.AGENT_TOWN_DATA ?? resolve(ROOT, "data"), "hosting.json");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function readConfig() {
  if (!existsSync(CONFIG)) die(`No hosting config yet. Run:\n  npm run hosted -- --init --owner you@example.com --team <team> --aud <AUD tag> --host agents.devsam.my`);
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}

if (flag("init")) {
  const owner = (opt("owner") ?? "").trim().toLowerCase();
  const team = (opt("team") ?? "").trim().replace(/\.cloudflareaccess\.com$/i, "");
  const aud = (opt("aud") ?? "").trim();
  const host = (opt("host") ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner)) die("--owner must be your email (the one you sign in to Cloudflare Access with)");
  if (!/^[a-z0-9-]+$/i.test(team)) die("--team must be your Zero Trust team name (the part before .cloudflareaccess.com)");
  if (!aud) die("--aud must be the Access application's Application Audience (AUD) tag");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) die("--host must be the public hostname, e.g. agents.devsam.my");
  const cfg = { ownerEmail: owner, teamDomain: `${team}.cloudflareaccess.com`, audience: aud, publicOrigin: `https://${host}`, tunnelPort: 4318 };
  mkdirSync(dirname(CONFIG), { recursive: true });
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`✓ Saved ${CONFIG}\n${JSON.stringify(cfg, null, 2)}`);
  process.exit(0);
}

if (flag("cloudflared")) {
  const cfg = readConfig();
  const id = opt("cloudflared");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) die("Pass the tunnel id: npm run hosted -- --cloudflared <tunnel-id>  (see `cloudflared tunnel list`)");
  const home = join(homedir(), ".cloudflared");
  const host = new URL(cfg.publicOrigin).hostname;
  console.log(`# Save as ${join(home, "config.yml")}
# Only /api/* goes to the tunnel-only API port (it checks every login).
# The local API port 4317 is never listed here.
tunnel: ${id}
credentials-file: ${join(home, `${id}.json`)}

ingress:
  - hostname: ${host}
    path: ^/api/
    service: http://127.0.0.1:${cfg.tunnelPort ?? 4318}
  - hostname: ${host}
    service: http://127.0.0.1:3000
  - service: http_status:404
`);
  process.exit(0);
}

// Start --------------------------------------------------------------------
const cfg = readConfig();
const env = {
  ...process.env,
  AGENT_TOWN_ACCESS_TEAM: cfg.teamDomain,
  AGENT_TOWN_ACCESS_AUD: cfg.audience,
  AGENT_TOWN_OWNER_EMAIL: cfg.ownerEmail,
  AGENT_TOWN_PUBLIC_ORIGIN: cfg.publicOrigin,
  AGENT_TOWN_TUNNEL_PORT: String(cfg.tunnelPort ?? 4318),
};

const npm = (a, opts = {}) => spawn("npm", a, { env, shell: WIN, ...opts });

if (!flag("no-build")) {
  console.log("Building the web app (production)…");
  const b = spawnSync("npm", ["run", "build", "-w", "@agent-town/web"], { env, stdio: "inherit", shell: WIN });
  if (b.status !== 0) die("Web build failed");
}

const procs = [
  ["server", ["run", "start", "-w", "@agent-town/server"]],
  ["web", ["run", "start", "-w", "@agent-town/web"]],
].map(([name, a]) => {
  const p = npm(a, { stdio: ["ignore", "pipe", "pipe"] });
  for (const s of [p.stdout, p.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (d) => d.split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`[${name}] ${l}`)));
  }
  p.on("exit", (code) => {
    console.log(`[${name}] exited with ${code}`);
    shutdown();
  });
  return p;
});

console.log(`\nAgent Town (hosted mode) for ${cfg.publicOrigin} — owner ${cfg.ownerEmail}`);
console.log("Start your tunnel separately:  cloudflared tunnel run   (Ctrl+C here stops Agent Town)\n");

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) {
    if (WIN) spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    else p.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
