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

Open http://127.0.0.1:3000, type a goal (or keep the example), keep **Launch Brief** selected, and press **Start run**. You'll see:
- agents moving between thinking, working and waiting in the office, driven only by events
- the reviewer rejecting the first draft, which loops back to the writer
- a human sign-off, then the landing page and launch channels built in parallel
- the CEO merging the final brief, then a **send** step that waits for your click
- `launch-brief.md`, `landing.html` and `outbox.md` under **Outputs**

Try **Pause**, reassign a step to another agent, then **Resume**. Use the **Replay** slider to scrub the event log.

## Layout

```
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
