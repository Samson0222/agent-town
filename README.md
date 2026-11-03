# Agent Town

A visual, multi-agent office for a single local user. You create your own agent teams and workflows, type a goal, watch the agents work in a pixel office, and get real files at the end. Click any agent to see its actual task, log and output.

> Status: **v0.3 prototype. Milestones 0 (contracts) and 1 (builders + mock engine) are done.** Real runtimes (OpenCode, then Claude Code) come next, after local verification. See [docs/progress-tracker.md](docs/progress-tracker.md).

## Quick start (mock mode: no keys, no spend)

Requires Node **22.13+**. Works on Windows 11, macOS and Linux.

```bash
npm install
```

```bash
npm run dev
```

Open http://127.0.0.1:3000. The sidebar has:

- **Office**: your team in a pixel office, always on screen. Live when they're working; strolling around when they're not.
- **Start**: type a goal, pick a workflow, press **Start run**. Approvals pop up as a banner; outputs (e.g. `launch-brief.md`, `landing.html`) appear on the run page.
- **Agents**: create agents (runtime → look and identity → instructions, skills, model) and open each agent's page (Now / Recent work).
- **Skills**: reusable know-how (`SKILL.md`): write one, import a folder, install from GitHub (preview, pinned commit), or use a starter. Give it to all agents or specific ones.
- **Teams**: pick members from your agents.
- **Workflows**: new workflows are a simple **step list** (who / what + review loop, my approval, run in parallel). The graph builder is still there as "advanced".

Everything runs on the free **mock** runtime unless you switch on OpenCode (see docs/milestone-0-opencode.md).

## Layout

```
packages/adapter-opencode   OpenCode 2.2.0 runtime adapter (opt-in)
packages/core   runtime-agnostic core: schemas, events, adapter + connector contracts, engine, mock runtime, reducer, importers
packages/pixel-office   pixel office engine + art vendored from pixel-agents (MIT); see its UPSTREAM.md
apps/server     localhost API (127.0.0.1:4317): SQLite + Markdown vault + SSE
apps/web        Next.js UI: team builder, workflow builder (React Flow), run view
scripts/        dev launcher, Milestone 0 OpenCode verification
docs/           plan, progress tracker, architecture, schema, discussion log
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server + web together |
| `npm test` | Core engine and API tests |
| `npm run typecheck` | Type-check all workspaces |
| `npm run verify:opencode` | Milestone 0 check of your local OpenCode, works on Windows/macOS/Linux (see [docs/milestone-0-opencode.md](docs/milestone-0-opencode.md)) |

## Safety rules

- Localhost only. The servers bind to 127.0.0.1 and the API refuses non-localhost origins.
- No credentials in workflows, teams, events or logs. Never commit `auth.json` or `.env` (both are git-ignored).
- Nothing is sent, published or spent without your click: send and spend tools are always gated.

## Naming

"Agent Town" is the product name. An unrelated visualization library already uses `agent-town`, so publish under `agent-town-app` or `agent-town-office` until you decide otherwise.
