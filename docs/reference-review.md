# Reference project review

2026-11-03. The brief asks us to reuse or copy patterns from five reference projects. Session 1 built from the brief's descriptions **without reading these projects**, which was a miss (see [discussion.md](discussion.md)). This review fixes that: each repo was cloned and its code read. The conclusions below are recommendations that need the user's decision.

| Brief reference | Repo found | License | Last commit | Confidence it's the right one |
|---|---|---|---|---|
| agent-town (pixel office library) | [rafapetter/agent-town](https://github.com/rafapetter/agent-town), npm `agent-town@0.2.0` | MIT | 2026-03-09 | High: "framework-agnostic pixel-art agent visualization library" |
| OpenClaw Office | [WW-AI-Lab/openclaw-office](https://github.com/WW-AI-Lab/openclaw-office) | MIT | 2026-06-12 | High |
| AI Agent Office | [Imangali7/ai-agent-office](https://github.com/Imangali7/ai-agent-office) (confirmed by the user) | MIT | 2026-09-06 | Confirmed |
| Agent Factory | [shuanbao0/agent-factory](https://github.com/shuanbao0/agent-factory) | **GPL-3.0** | 2026-04-11 | High: 64 role templates, dashboard, task board, message center |
| Mission-Control | [builderz-labs/mission-control](https://github.com/builderz-labs/mission-control) | MIT | 2026-10-28 | High: `src/lib/adapters/` with register / heartbeat / report |

Also seen, but not a brief reference: [geezerrrr/agent-town](https://github.com/geezerrrr/agent-town) (MIT, a Phaser pixel RPG that is a whole platform built on OpenClaw, not a library).

---

## 1. agent-town library → the office view

**What it is:** a zero-dependency TypeScript library on Canvas 2D (about 9.7k lines). Its API is `new AgentTown({container, environment, officeSize, onAgentClick})`, `addAgent`, `updateAgent(id, {status, message})`, `addTask` / `updateTask` (kanban rooms with flying-task animations) and `addReview`. Its statuses are `idle, typing, reading, thinking, waiting, success, error`. It ships 7 environments, pathfinding, speech bubbles and auto-scaling.

**Fit:** this is what the brief means by "reuse pixel office rendering". It is far richer than the ~300-line office written in session 1.

**Problem:** the library runs **its own random behaviour**, and there is no setting to turn it off (`src/AgentTown.ts` around lines 1060–1135):
- idle agents roam every 3–6 s
- coffee breaks every 30–50 s, random conversations, high-fives and stretching
- random idle speech bubbles, e.g. *"Pretending to be busy..."*

This breaks the brief's rule that every visual change must come from a real event.

**Recommendation:** use it, wrapped at the boundary as the brief says:
- **Wrapper** (`apps/web/components/Office.tsx`) maps our statuses:
  - `thinking → thinking`
  - `working → typing`, or `reading` when the current tool is a read tool
  - `waiting-for-human → waiting` plus a "Waiting for you" bubble (the brief's own example: the human-wait status is added in our wrapper)
  - `done → success`, `failed → error`, `idle → idle`
- Our `task.stage` events drive `addTask` / `updateTask`, and `onAgentClick` opens the agent detail panel.
- **Small patch** (via `patch-package`, not a fork) adding a setting `ambient: false` that skips the roaming, social and idle-message block. We also offer it upstream as a PR, so the patch can be dropped later.
- Desk positions: the library auto-assigns zones, so our `appearance.desk` becomes a hint. The office will still be derived from the team in the run.
- Risk: a small project (10★, last release March 2026). It's MIT, so we can vendor it if it's abandoned.

## 2. OpenClaw Office → event stream to animations, logs, tokens

**What it does:**
- `src/gateway/event-parser.ts` turns each gateway event stream (`lifecycle, tool, assistant, thinking, approval, error, item, plan, patch, …`) into `{status, currentTool, speechBubble, summary}`.
- `office-store.ts` applies the result per agent.
- `metrics-reducer.ts` keeps `totalTokens` and `tokenRate`.
- Visual statuses: `idle, thinking, tool_calling, speaking, spawning, error, offline`.

**Fit:** our design already follows this pattern (normalized events → one reducer → views). Worth adopting:
- `currentTool` and the latest speech text per agent in `reduceRunState`, so bubbles show what the agent is actually doing
- token totals and token rate next to USD cost
- an `offline` / disconnected agent state for runtimes whose session drops

No code needs copying; these are small additions to our reducer.

## 3. AI Agent Office → SQLite + Markdown vault

**Confirmed:** [Imangali7/ai-agent-office](https://github.com/Imangali7/ai-agent-office) (MIT). Node + Express, with SQLite `workforce_os.db` and these tables:
- `tasks`: `prompt`, `status`, `report_file`, `context_file`
- `agent_runs`: `input_prompt`, `output_text`, `duration_ms`, `tokens_used`, `model_used`, `status`, `error_message`

Its vault folders are `00-INBOX, 01-KNOWLEDGE, 02-PROJECTS, 03-DAILY, 04-OUTPUTS, 05-RESOURCES, 06-ARCHIVE, 07-SYSTEM`. Intake context is read from `00-INBOX`, and every agent output plus the final report is written to `04-OUTPUTS` as Markdown with a metadata header.

**Adopt:**
- the numbered vault layout per team vault, with run outputs under `04-OUTPUTS/<run>/` and a Markdown metadata header
- an `agent_runs`-style per-step table (duration, tokens, model, status)

**Do not adopt:** its fixed CEO decompose/synthesize orchestrator; our workflow engine replaces it.

### Earlier candidates (superseded)

No repo with that exact name matched the brief's description ("SQLite + Markdown vault for runs and outputs; fixed CEO-decomposes-everything logic"). The two closest:
- **claw-empire** (Apache-2.0): "CEO desk", local SQLite, pixel office, and it drives **OpenCode, Claude Code, Codex and Gemini CLIs**. That makes it a very useful reference for Milestone 2's OpenCode adapter.
- **ajsahni/agents-office**: a Markdown "brain" folder (an Obsidian vault works) where results are filed. **Its license forbids building on it or bundling it** (PolyForm Noncommercial + Sahni.ai terms), so ideas only, no code.

Our current storage (SQLite event log + `data/vault/runs/<id>/` Markdown/HTML files) already matches the pattern the brief describes. **Question for the user:** which project did you mean? A link is enough.

## 4. Agent Factory → dashboard layout, task board, message center, role template shape

**Role template format** (`templates/agents/builtin/<id>/`):
- `template.json`: `{id, name, description, emoji, category, group, defaults: {model, skills[], peers[]}}`
- plus `IDENTITY.md` (name / vibe / emoji), `SOUL.md` (behaviour rules), `TOOLS.md` and `AGENTS.md`

**License warning:** Agent Factory is **GPL-3.0**. Copying its code (or its 64 role texts) into Agent Town would make Agent Town GPL as well. The brief only asks to copy the *template format*, and a data shape can be supported without copying code.

**Recommendation:**
- Add `emoji`, `description` and `group` to our `AgentTemplate`.
- Write our own importer that reads a folder in that shape: `systemPrompt = IDENTITY.md + SOUL.md`, `skills` are shown as notes, and `peers` are ignored (teams are user-built).
- Their dashboard ideas (task board with priority, a message center as its own page) are UI layout, which we can mirror in our own code.

## 5. Mission-Control → adapter pattern

**What it does:** `FrameworkAdapter { register, heartbeat, reportTask, getAssignments, disconnect }`, one ~50-line file per framework (openclaw, crewai, langgraph, autogen, claude-sdk, generic). Agents **push** state to `POST /api/adapters` and pull assignments, the dashboard updates over SSE, and heartbeats keep agents marked "online".

**Fit:** our `RuntimeAdapter` is the **pull / session** shape (we start a session and stream it). That suits CLI runtimes like OpenCode and Claude Code (Milestones 2–3). Mission-Control's **push / heartbeat** shape suits frameworks that run on their own (LangGraph, CrewAI: Milestone 4), which is what the brief says.

**Recommendation:**
- Keep `RuntimeAdapter` for M2–M3.
- At M4, add an optional `ExternalAgentAdapter` (register / heartbeat / report / assignments) that feeds the same event stream, plus an `offline` status driven by missed heartbeats.
- Nothing to change now; this is recorded so M4 doesn't need a core rewrite.

---

## Proposed order of work (after the user confirms)
1. Office → `agent-town` library + wrapper + `ambient: false` patch (largest visible change).
2. Reducer additions from OpenClaw Office (current tool, speech text, tokens).
3. Agent Factory template importer + `emoji` / `description` / `group` fields.
4. Note the Mission-Control push adapter in the M4 plan.
5. Once AI Agent Office is identified, check its vault layout against ours.

The OpenCode check (`npm run verify:opencode -- --serve`) can run in parallel, since it is independent of all of this.
