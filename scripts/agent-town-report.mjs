#!/usr/bin/env node
/**
 * Report an outside agent's status into its Agent Town office.
 *
 *   node scripts/agent-town-report.mjs <status> "<summary>" [with-bot-id]
 *
 * status: coding | terminal | browsing | reading | thinking | needs-you | error | idle | done
 *
 * Environment:
 *   AGENT_TOWN_BOT_TOKEN   the bot's token (atb_…), from the team page — required
 *   AGENT_TOWN_URL         default http://127.0.0.1:4317 (same PC); e.g. https://agents.devsam.my from elsewhere
 *   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
 *                          a Cloudflare Access service token, needed when reporting through the tunnel
 *
 * Privacy: report task types only, never accounts, private messages, amounts or unpublished plans.
 * A failed report never fails the caller: it prints a warning and exits 0.
 */
const STATUSES = ["coding", "terminal", "browsing", "reading", "thinking", "needs-you", "error", "idle", "done"];
const [status, summary = "", withId] = process.argv.slice(2);

function warn(msg) {
  console.error(`agent-town-report: ${msg}`);
  process.exit(0);
}

if (!STATUSES.includes(status ?? "")) warn(`status must be one of: ${STATUSES.join(", ")}`);
const token = process.env.AGENT_TOWN_BOT_TOKEN;
if (!token) warn("set AGENT_TOWN_BOT_TOKEN (shown once when the outside agent was added)");
const base = (process.env.AGENT_TOWN_URL ?? "http://127.0.0.1:4317").replace(/\/+$/, "");
const url = new URL(base);
const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
if (!local && url.protocol !== "https:") warn("AGENT_TOWN_URL must use https when it isn't this computer");

const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "User-Agent": "agent-town-report" };
if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
  headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
  headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
}
const body = JSON.stringify({ status, summary: summary.slice(0, 80), with: withId });

// A sleeping PC or tunnel may take a while to answer the first time: 60 s timeout, 2 retries.
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const res = await fetch(`${base}/api/report`, { method: "POST", headers, body, signal: AbortSignal.timeout(60_000) });
    if (res.status === 204) process.exit(0);
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2_100));
      continue;
    }
    const text = await res.text();
    warn(`report refused (${res.status}): ${text.slice(0, 200)}`);
  } catch (err) {
    if (attempt === 2) warn(`could not reach ${base}: ${err.message}`);
    await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
  }
}
warn("report not delivered");
