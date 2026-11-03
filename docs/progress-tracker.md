# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase

- Milestone 0 (contracts ✅, OpenCode verification ⏸ waiting on the user's machine) and Milestone 1 (✅, waiting for review).

## Current Goal

- The user reviews the mock-mode demo and runs `scripts/verify-opencode.sh` locally. Then pin the OpenCode version and start Milestone 2.

## Completed

- `docs/` folder: brief, plan, architecture, workflow schema reference, M0 guide, discussion log, this tracker.
- npm workspaces monorepo: `packages/core`, `apps/server`, `apps/web`.
- Core: Team / Agent and Workflow v1 schemas (zod), event model, runtime adapter and connector contracts, capability manifest, preflight, workflow engine, mock runtime, built-in / mock connectors, `reduceRunState`, 4 starter templates.
- Server: `node:sqlite` store, Markdown vault on disk, REST + SSE, localhost-only CORS, orphaned runs closed on restart.
- Web: team builder, React Flow workflow builder (+ JSON tab, import / export, checks), run view (canvas office, graph, board, logs, cost, approvals, controls, outputs, replay, agent detail).
- Tests: `npm test` runs 15 core + 5 API tests, all passing. The demo was also driven end-to-end in Chromium (review rejection → sign-off → pause / reassign / resume → gated send → done) with no console errors.
- M0 script: `npm run verify:opencode` (cross-platform Node; `.sh` kept for macOS/Linux) + `scripts/opencode-sdk-check.mjs`.

## In Progress

- None. Waiting on the user (see Next Up).

## Next Up

- **User:** run `npm install && npm run dev`, open http://127.0.0.1:3000, and run the Launch Brief demo. Give feedback or approval.
- **User (Windows 11):** `git pull`, then `npm install`, then `npm run verify:opencode -- --serve` (optionally add `--smoke`), and share the report.
- **Then (M2):** OpenCode adapter against the pinned SDK → MCP + OpenConnector connectors → real demo run.

## Open Questions

- Where OpenConnector runs locally, and which app the connector demo should use (GitHub issue vs Notion page)?
- Claude Code adapter (M3): Agent SDK (TypeScript) or headless `claude` CLI?
- Final repo slug for publishing (`agent-town-app` / `agent-town-office`)? Not urgent.
- Should pause also cancel and re-queue in-flight steps (needs `cancellation`)? Today in-flight steps finish.

## Architecture Decisions

- Events are the source of truth; every view is `reduceRunState(events)` (also used for replay).
- Runtime sessions only get tools that need no approval; send / spend run only via gated Tool Call nodes.
- Runs snapshot their workflow and team at start.
- Workflow v1: `schemaVersion` + `revision`; optional `entryNodeIds` for loops back to the first node.
- `node:sqlite` (Node ≥ 22.13) instead of a native SQLite module.
- Details: [architecture.md](architecture.md), [discussion.md](discussion.md).

## Session Notes

- 2026-11-03: Session 1 built M0 contracts and M1 in a cloud container (no OpenCode available). The branch is `claude/wonderful-goodall-t2hsgx`.
- Data lives in `./data` (git-ignored); delete it to reset to the starter templates. Templates are only seeded when there are no teams.
- `AGENT_TOWN_MOCK_STEP_MS` sets mock speed (default 350 ms per event); `AGENT_TOWN_PORT` sets the server port (default 4317); `NEXT_PUBLIC_AGENT_TOWN_API` sets the API URL the web app uses.
- The user is on **Windows 11**: keep all scripts Node-based and test with Windows in mind.
- Next.js 16 writes `apps/web/AGENTS.md` on dev start; it is git-ignored.
