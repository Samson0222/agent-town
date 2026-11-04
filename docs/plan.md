# Plan

Follows [brief-v0.3.md](brief-v0.3.md) → *Build order*. ✅ done · 🟡 partly · ⬜ not started · ⏸ blocked on user

## Milestone 0 — interface + verify OpenCode
- ✅ Runtime adapter contract + capability manifest (`packages/core/src/adapters/contract.ts`)
- ✅ Connector contract + registry with allowlists and read/write/send/spend categories
- ✅ Normalized event model (`packages/core/src/events.ts`)
- ✅ Verification script: `npm run verify:opencode` (+ `-- --serve`, `--smoke`); cross-platform
- ⏸ Run it on the user's machine; record the version, models and subscription; pin the version ([milestone-0-opencode.md](milestone-0-opencode.md))

## Milestone 1 — builders + mock engine
- ✅ Team create / edit / clone / delete; agent templates (role, system prompt, runtime, model + fallback, tools, permissions, colour / sprite / desk, cost cap)
- ✅ Workflow JSON schema v1, validation, import / export, revisions
- ✅ Workflow builder (React Flow): all 7 node types, edge conditions, JSON tab, preflight
- ✅ Workflow engine: parallel, branch, merge, loops, human approval, tool call, output passing, cost caps, fallback model, failure handling
- ✅ Mock runtime (zero spend, deterministic review rejection)
- ✅ Office (canvas), Graph, Board, Messages / logs, Cost views, all driven by one event stream
- ✅ Controls: pause / resume / stop / approve / reject / reassign / redirect; replay slider; click an agent → task, log, output
- ✅ Starter templates: Launch Brief (demo), Software Sprint, Research Brief, Content Team
- ✅ Tests: core engine (15), API (5); browser end-to-end run of the demo
- ⏸ User reviews the mock demo and approves moving on to real runs

## Milestone 2 — OpenCode adapter + connectors (after M0 results + approval)
- ✅ `OpenCodeAdapter` (2.2.0, `@opencode/client`): session per Agent Task node, event mapping, cancel, cost, model list. Tested on a fake server only; ⬜ first real run (needs the user's OK)
- ⬜ Start / attach `opencode serve` on 127.0.0.1 with `OPENCODE_SERVER_PASSWORD`
- ⬜ Generic MCP connector (stdio / HTTP), with tools mapped to categories from config
- ⬜ OpenConnector (self-hosted) connector: `list_apps`, `search_actions`, `execute_action`; credentials stay in the gateway
- ⬜ Demo: read a GitHub issue or Notion page via OpenConnector / MCP
- ⬜ Run the Launch Brief end-to-end on OpenCode

## Office upgrades (ideas borrowed from @btcup99's "3D AI office" post, 2026-11-04)
Small and view-only; no security impact. See reference-review.md §9.
- ✅ Clearer statuses from the current tool: coding · terminal · browsing · reading · thinking · needs you (red pulse) · error · done
- ✅ Collaboration: when a review loop or handoff runs between two agents, both walk to the meeting table, then back to their desks
- ✅ Done moment: a short hop and sparkle when a step finishes
- ✅ "Simulated" label on the office and run when the practice runtime is used
- ✅ Phone layout: the side panel becomes a bottom drawer

## 2D / 3D office switch
The office is only a view of `reduceRunState(events)`, so a 3D view can sit beside the 2D one and use the same input.
- ✅ An `OfficeView` interface in the web app, the input the current pixel office already takes (agents, statuses, current tool, seats). The 2D pixel office becomes one implementation.
- ✅ A 3D implementation with Three.js (MIT): a block-style isometric office (desks, meeting table, lounge) with our own simple low-poly characters, coloured with each agent's look colour.
  - no art copied from the post
  - if we use outside models, only CC0 ones, recorded in reference-review.md
- ✅ Same behaviour rules in both views: always in the office, working = seated and typing, waiting = seated with "…", idle and done stroll
- ✅ A 2D / 3D toggle on the Office and run pages, remembered per browser. Phones default to 2D (lighter); 3D falls back to 2D if WebGL is unavailable.
- ✅ Browser check for both views, plus a test that both get the same state from the same events

## Hosted access — public, logged-in users only (design: [hosting.md](hosting.md))
Your PC plus a Cloudflare Tunnel, Cloudflare Access login, and Agent Town roles (owner / operator / viewer).
- ✅ `npm run hosted` (production build, same-origin API, separate tunnel-only API port)
- ✅ Cloudflare Access JWT check on the tunnel port, a `users` table, `GET /api/me`
- ✅ Role checks on every route and in the UI; send / spend approvals for the owner only; daily budget per operator
- ✅ People page (invite, role, remove, budget); `actor` on events ("Approved by …")
- ✅ Security tests (forged / expired / wrong-audience tokens, uninvited email, role matrix) and a Windows setup guide
- ⬜ **Going live** (switching the tunnel on) is the user's step

## External agents report in (from the same post)
Bots that run outside Agent Town (Codex, Grok bots, scripts) appear in the office.
- ⬜ Per-bot report token (stored hashed, compared in constant time); `POST /api/report {status, summary}` on the tunnel port
- ⬜ Clean input: status from a fixed list, summary ≤ 80 characters with control characters stripped, body ≤ 4 KB, 1 report per 2 s per bot, 120 per minute overall
- ⬜ No report for 30 minutes → idle. A Node `agent-town-report` command for bots to call.
- ⬜ Privacy rule shown when the token is created: report task types only — no accounts, messages, amounts or unpublished plans
- ⬜ Fits the M4 push-adapter idea (Mission-Control pattern)

## Milestone 3 — second runtime proof
- ⬜ `ClaudeCodeAdapter` as a new file only (Agent SDK or headless CLI, to be decided)
- ⬜ Run the same demo on Claude Code, plus a mixed-runtime run

## Milestone 4 — on demand
- ⬜ ACP adapters (Codex, Gemini CLI, …), then framework adapters (LangGraph, CrewAI, OpenClaw)

## Done criteria (v0.3) — status
| Criterion | Status |
|---|---|
| Demo end-to-end in mock mode, no keys | ✅ |
| Same demo through OpenCode, then Claude Code | ⬜ M2 / M3 |
| Connector demo with the credential behind the gateway | ⬜ M2 |
| Pause mid-run, reassign, resume | ✅ |
| Every agent status matches its last event | ✅ (enforced by the reducer, and tested) |
| ≥ 2 saved files (brief + landing page) | ✅ `launch-brief.md`, `landing.html` |
| Total cost visible, with a cap that stops the run | ✅ (simulated in mock) |
| No send / publish / spend without the user's click | ✅ (registry + engine, tested) |
