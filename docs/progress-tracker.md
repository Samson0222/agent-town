# Progress Tracker

Update this file whenever the current phase, active feature, or implementation state changes.

## Current Phase

- **Autonomous session (user asleep): items 1–5 all done ✅.** 1 pixel office · 2 shared agent list · 3 skills library · 4 step-list workflows · 5 OpenCode 2.2.0 adapter (mocks only).

## Current Goal

- Waiting for the user's review. Next candidates: the first real OpenCode run (needs the user's go-ahead: it spends credit), the permission-reply contract addition, then M3 (Claude Code adapter).

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

- **Item 1 — Pixel office (2026-11-03):**
  - pixel-agents engine + art vendored in `packages/pixel-office` (UPSTREAM.md has the commit, MIT and the JIK-A-4 credit)
  - everyone always in the office, behaviour per pixel-agents rules
  - `/office` page, live-linked to an active run
  - auto-added desk pods when a team outgrows the work seats (tested with 10 agents)
  - old town renderer removed

- **Item 2 — Shared agent list (2026-11-03):**
  - `/agents` list; Multica-style **New agent** in 3 steps (runtime → identity: look, colour, name, role, description → instructions, skills, model, plus advanced tools / approvals / cost cap → done page with next steps)
  - `/agents/[id]` with Overview (Now / Recent work from `step_runs`, instructions) and a side card (runtime, model, cost, skills global + own, teams, workflows), plus Settings (same form)
  - teams pick members from the library (`memberIds`); automatic migration of embedded agents, with clashes renamed and workflows remapped. Tested on a real old database.
  - avatars = the agent's pixel-office character

- **Item 3 — Skills library (2026-11-03):**
  - `/skills` with **New skill**: write one, import a folder (one or many SKILL.md folders), install from GitHub (preview → install, pinned to the exact commit, "Update from source", scripts kept as text and never run), 4 starter skills
  - scope chosen when adding: **All agents** (switch off per agent) or **Specific agents**
  - skill page: edit SKILL.md and extra files, scope, who has it
  - agent pages show global and own skills
  - at run time, active skills go into the prompt next to the instructions (or natively for runtimes with the `skills` capability), logged as `skills.loaded`

- **Item 4 — Step-list workflows (2026-11-03):**
  - new workflows open as a **step list** (Who / What, name, optional "save result as", plus toggles: review loop with reviewer, needs my approval, run in parallel with previous)
  - graph preview tab, JSON tab, "Edit as graph (advanced)"
  - the server regenerates the graph from the steps on every save and import
  - tested end to end in the browser: review loop sent work back once → approval → parallel pair → done

- **Item 5 — OpenCode 2.2.0 adapter (2026-11-03):**
  - `packages/adapter-opencode` on `@opencode/client@2.2.0`, mapping sessions, events, cost and cancel to the adapter contract
  - opt-in registration (`AGENT_TOWN_OPENCODE_URL`, localhost only)
  - 8 adapter tests against a fake 2.2.0 server, plus a compile-time check against the real client package
  - no real runs, no spend

## In Progress

- None. Waiting on the user (see Next Up).

## Next Up

- **User:** run `npm install && npm run dev`, open http://127.0.0.1:3000, and run the Launch Brief demo. Give feedback or approval.
- **User:** re-run `npm run verify:opencode -- --serve` after `git pull` (the SDK check now uses `@opencode/client` for 2.x). OpenCode **2.2.0** is detected; see milestone-0-opencode.md → Results.
- **Then (M2):** OpenCode adapter against the pinned SDK → MCP + OpenConnector connectors → real demo run.

## Open Questions

- **First real OpenCode run:** OK to try one small run on a cheap or free model (e.g. a `-free` model) with a low cost cap? Steps are in milestone-0-opencode.md.
- **Permission answers:** OK to add `respond(sessionId, requestId, approved, note)` to the adapter contract, so OpenCode permission questions can be answered in Agent Town's approval banner?
- **GitHub skill install wasn't tried against real GitHub**: this container's network returns 403 for api.github.com. It's covered by tests against a fake GitHub API. Please try one real install locally (e.g. a public skill folder URL).
- Re-run `npm run verify:opencode -- --serve` to confirm the `@opencode/client` session check, the auth header for `OPENCODE_SERVER_PASSWORD`, and the `session.usage.updated` payload (cost / tokens).
- Claude Code adapter (M3): Agent SDK (TypeScript) or headless `claude` CLI?
- OpenConnector: where it runs locally, and whether the connector demo should read a GitHub issue or a Notion page.
- Should pause also cancel and re-queue in-flight steps (needs `cancellation`)? Today in-flight steps finish.

- agent-desktop (computer use) as an MCP connector after M2: approve desktop actions by (a) auto-approving writes for chosen agents and apps, or (b) a per-action approval pause? See reference-review.md §8.

## Architecture Decisions

- Events are the source of truth; every view is `reduceRunState(events)` (also used for replay).
- Runtime sessions only get tools that need no approval; send / spend run only via gated Tool Call nodes.
- Runs snapshot their workflow and team at start.
- Workflow v1: `schemaVersion` + `revision`; optional `entryNodeIds` for loops back to the first node.
- `node:sqlite` (Node ≥ 22.13) instead of a native SQLite module.
- Office = vendored pixel-agents (MIT) in `packages/pixel-office` (replaced the earlier agent-town renderer). The app compiles against generated `types/`.
- Vault layout follows AI Agent Office; a run's folder is stored in `runs.vault_dir`.
- Details: [architecture.md](architecture.md), [discussion.md](discussion.md), [reference-review.md](reference-review.md).

## Session Notes

- 2026-11-04: Added root `AGENTS.md` (rules for coding agents) and `CLAUDE.md` (imports it).

- 2026-11-04: Fixes from user testing: GitHub skill install now accepts a repo link (auto-finds the skill or offers a choice); every agent gets an office character, and the agent page has a "Change look" shortcut.

- 2026-11-03: Session 1 built M0 contracts and M1 in a cloud container (no OpenCode available). The branch is `claude/wonderful-goodall-t2hsgx`.
- Data lives in `./data` (git-ignored); delete it to reset to the starter templates. Templates are only seeded when there are no teams.
- `AGENT_TOWN_MOCK_STEP_MS` sets mock speed (default 350 ms per event); `AGENT_TOWN_PORT` sets the server port (default 4317); `NEXT_PUBLIC_AGENT_TOWN_API` sets the API URL the web app uses.
- The user is on **Windows 11**: keep all scripts Node-based and test with Windows in mind.
- Next.js 16 writes `apps/web/AGENTS.md` on dev start; it is git-ignored.
