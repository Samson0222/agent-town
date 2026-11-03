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
- ⬜ `OpenCodeAdapter` against the pinned SDK: session per Agent Task node, SSE → RuntimeEvent mapping, cancel, cost from events, model list, tier detection
- ⬜ Start / attach `opencode serve` on 127.0.0.1 with `OPENCODE_SERVER_PASSWORD`
- ⬜ Generic MCP connector (stdio / HTTP), with tools mapped to categories from config
- ⬜ OpenConnector (self-hosted) connector: `list_apps`, `search_actions`, `execute_action`; credentials stay in the gateway
- ⬜ Demo: read a GitHub issue or Notion page via OpenConnector / MCP
- ⬜ Run the Launch Brief end-to-end on OpenCode

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
