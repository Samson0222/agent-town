#!/usr/bin/env node
// Starts the Agent Town server (127.0.0.1:4317) and web app (127.0.0.1:3000) together.
import { spawn } from "node:child_process";

const procs = [
  ["server", ["run", "dev", "-w", "@agent-town/server"]],
  ["web", ["run", "dev", "-w", "@agent-town/web"]],
].map(([name, args]) => {
  const p = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
  const prefix = (line) => `[${name}] ${line}`;
  for (const s of [p.stdout, p.stderr]) {
    s.setEncoding("utf8");
    s.on("data", (d) => d.split("\n").filter(Boolean).forEach((l) => console.log(prefix(l))));
  }
  p.on("exit", (code) => {
    console.log(prefix(`exited with ${code}`));
    shutdown();
  });
  return p;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill("SIGTERM");
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
