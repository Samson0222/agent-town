# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase

- M0: contracts ✅, OpenCode verified (v2.2.0) ✅. The SDK session check needs one re-run with the fixed script.
- M1: ✅, plus a UI redesign and alignment with the reference projects ✅. Waiting for the user's review.

## Current Goal

- The user reviews the redesigned UI (Town scene). After their OK, start **M2: the OpenCode adapter on `@opencode/client@2.2.0`**.

## Completed

- `docs/` folder: brief, plan, architecture, workflow schema reference, M0 guide, discussion log, this tracker.
- npm workspaces monorepo: `packages/core`, `apps/server`, `apps/web`.
- Core: Team / Agent and Workflow v1 schemas (zod), event model, runtime adapter and connector contracts, capability manifest, preflight, workflow engine, mock runtime, built-in / mock connectors, `reduceRunState`, 4 starter templates.
- Server: `node:sqlite` store, Markdown vault on disk, REST + SSE, localhost-only CORS, orphaned runs closed on restart.
- Web: team builder, React Flow workflow builder (+ JSON tab, import / export, checks), run view (canvas office, graph, board, logs, cost, approvals, controls, outputs, replay, agent detail).
- Tests: `npm test` runs 15 core + 5 API tests, all passing. The demo was also driven end-to-end in Chromium (review rejection → sign-off → pause / reassign / resume → gated send → done) with no console errors.
- M0 script: `npm run verify:opencode` (cross-platform Node; `.sh` kept for macOS/Linux) + `scripts/opencode-sdk-check.mjs`.

- **Session 2 (2026-11-03):**
  - Reference projects reviewed (docs/reference-review.md).
  - Office replaced by the vendored `agent-town` renderer (MIT), with patch 0001 `ambient:false` and patch 0002 for an overflow crash. Town scene by default, scene picker.
  - New UI: sidebar shell, goal-first Start page, Runs list, run page with approval banner, team roster, plain-English activity feed, steps panel, outputs cards, agent drawer.
  - Reducer: current tool + tokens (OpenClaw Office pattern).
  - Vault: AI Agent Office layout (`<team>/00-INBOX … 07-SYSTEM`, runs in `04-OUTPUTS/<date>-<workflow>-<run8>/` with `_run.md`), plus a `step_runs` table.
  - Agent Factory importer (format only, GPL code not copied) with an Import button on the team page.
  - Windows-friendly scripts.
  - Tests: 19 core + 7 API.

## In Progress

- None. Waiting on the user (see Next Up).

## Next Up

- **User:** run `npm install && npm run dev`, open http://127.0.0.1:3000, and run the Launch Brief demo. Give feedback or approval.
- **User:** re-run `npm run verify:opencode -- --serve` after `git pull` (the SDK check now uses `@opencode/client` for 2.x). OpenCode **2.2.0** is detected; see milestone-0-opencode.md → Results.
- **Then (M2):** OpenCode adapter against the pinned SDK → MCP + OpenConnector connectors → real demo run.

## Open Questions

- Re-run `npm run verify:opencode -- --serve` to confirm the `@opencode/client` session check, the auth header for `OPENCODE_SERVER_PASSWORD`, and the `session.usage.updated` payload (cost / tokens).
- Claude Code adapter (M3): Agent SDK (TypeScript) or headless `claude` CLI?
- OpenConnector: where it runs locally, and whether the connector demo should read a GitHub issue or a Notion page.
- Should pause also cancel and re-queue in-flight steps (needs `cancellation`)? Today in-flight steps finish.
- Send patches 0001 / 0002 upstream to rafapetter/agent-town? (Needs the user's OK; it publishes something.)

## Architecture Decisions

- Events are the source of truth; every view is `reduceRunState(events)` (also used for replay).
- Runtime sessions only get tools that need no approval; send / spend run only via gated Tool Call nodes.
- Runs snapshot their workflow and team at start.
- Workflow v1: `schemaVersion` + `revision`; optional `entryNodeIds` for loops back to the first node.
- `node:sqlite` (Node ≥ 22.13) instead of a native SQLite module.
- Office renderer = vendored rafapetter/agent-town at 78e8e91 (npm 0.2.0 ships no JS). All local changes are in `packages/office-renderer/patches/` and the app compiles against generated `types/`.
- Vault layout follows AI Agent Office; a run's folder is stored in `runs.vault_dir`.
- Details: [architecture.md](architecture.md), [discussion.md](discussion.md), [reference-review.md](reference-review.md).

## Session Notes

- 2026-11-03: Session 1 built M0 contracts and M1 in a cloud container (no OpenCode available). The branch is `claude/wonderful-goodall-t2hsgx`.
- Data lives in `./data` (git-ignored); delete it to reset to the starter templates. Templates are only seeded when there are no teams.
- `AGENT_TOWN_MOCK_STEP_MS` sets mock speed (default 350 ms per event); `AGENT_TOWN_PORT` sets the server port (default 4317); `NEXT_PUBLIC_AGENT_TOWN_API` sets the API URL the web app uses.
- The user is on **Windows 11**: keep all scripts Node-based and test with Windows in mind.
- Next.js 16 writes `apps/web/AGENTS.md` on dev start; it is git-ignored.
