# Agent Town — brief for Claude Code

Prepared 2026-11-03. Version v0.3 — this supersedes the v0.2 brief.
Hand this file to Claude Code to implement the prototype. Nothing here submits, publishes, or spends anything on its own.

## What it is

Agent Town is a visualizable, multi-agent office system. A single user, working locally, creates their own agent teams and workflows — there are no fixed agents. They type a goal, watch agents work in a pixel office, and get a real deliverable at the end. If you cannot click an agent and see its real task, log, and output, it does not count as done.

## Core concepts — all user-created, none hardcoded

- **Agent template:** name, role, system prompt, runtime, model (per-agent, with a team default), allowed tools/connectors, permissions, colour / sprite / desk.
- **Team:** a set of agent templates, a shared vault, and defaults. Create, clone, edit, and delete teams. A team may mix runtimes.
- **Workflow:** a graph, not a linear chain. Node types: Agent Task, Parallel fan-out, Branch / Condition, Tool Call, Human Approval, Merge / Synthesis, End. Edges carry conditions and pass outputs forward.
- **Run:** one execution of a workflow with inputs, live state, and a full event log you can replay.
- **Workflow JSON:** versioned (start at v1), importable/exportable, and the single source of truth for a workflow. No workflow, team, or agent definition may require a code change to create, edit, or delete.

Starter templates are examples only, not fixed: Launch Brief, Software Sprint, Research Brief, Content Team. Start from one, edit it, or start blank.

## Design principle: own design, reused parts, modify where inflexible

Do NOT build everything from scratch. Do NOT fork one whole app and bend it into Agent Town either.

- **Own design — do not borrow this:** the Team / Workflow / Run data model, the workflow JSON schema, the office look and layout, the adapter and connector interfaces, and the human-approval rules. This is what makes Agent Town different: dynamic teams and workflows.
- **Reuse as libraries:** pixel office rendering (agent-town library ideas), workflow graph editing (React Flow), agent runtimes (see below), and model gateways. Do not build a drag-and-drop canvas, a pixel renderer, or an LLM loop from scratch.
- **Copy the pattern, not the whole app:**
  - From OpenClaw Office: how to turn a gateway event stream into office animations, activity logs, and token/cost tracking. Same pattern, different event source.
  - From AI Agent Office: the SQLite + Markdown vault pattern for runs and outputs. Replace its fixed CEO-decomposes-everything logic with the workflow engine.
  - From Agent Factory: the dashboard layout, task board, message center, and the shape of a role template. Copy the template format, not its OpenClaw engine or its 64 fixed roles.
  - From Mission-Control: the adapter pattern — normalize registration, heartbeat, and task reporting from different frameworks into one internal model, then dispatch tasks back to each framework's execution entry point.
- **When a reference method is not flexible enough, modify it at the boundary, not by forking the whole repo.** Example: if a visualization library has no "waiting for human" status, add that status in Agent Town's wrapper, not by forking the library. If an adapter lacks a capability a workflow node needs, the engine must warn before the run, not fail mid-run.

## Architecture: a runtime-agnostic core + three pluggable layers

Agent Town's core never imports a runtime, a model provider, or a SaaS API directly. Everything outside the core is reached through an interface.

### Layer 1 — Runtime adapters: how an agent thinks and executes

Every runtime adapter implements the same contract:

```
startSession, sendPrompt, streamEvents, cancel,
getStatus, getCost, listModels, listCapabilities
```

Each adapter ships a capability manifest: streaming, subagents, file edit, tool use, cost reporting, cancellation, and any other capability a workflow node might require. The workflow engine checks capabilities before a run starts.

Runtime candidates, in build order — do NOT build all of these upfront:

- **Reference runtime (build first): OpenCode** — see "OpenCode, first runtime" below, plus a Mock adapter for zero-cost UI testing.
- **Second runtime (the proof the interface works): Claude Code** — via its SDK / CLI. Adding this must be a new adapter file, not a core rewrite. If it requires a core rewrite, the interface is wrong — stop and fix the interface first.
- **Later, via the agentabi / ACP pattern:** Codex, Gemini CLI, Copilot, Cursor Agent, and any other ACP-compatible CLI. One workspace driving many CLIs over Agent Client Protocol, with a unified interface so the integration is written once and the agent is swapped by config.
- **Later, via the Mission-Control adapter pattern:** LangGraph, CrewAI, OpenClaw, Microsoft Agent Framework. These are frameworks, not CLIs, so their adapters wrap a graph / crew run instead of a session.

A workflow may mix runtimes in one run — for example, Researcher on Claude Code, Developer on OpenCode, Reviewer on a LangGraph graph — all on the same event stream, all in the same office.

### Layer 2 — Model providers: how models are reached

Separate from runtimes. Direct providers (OpenAI, Anthropic, Google, DeepSeek, Ollama local) and gateways (OpenCode Zen / Go, LiteLLM, any OpenAI-compatible proxy). Per-agent model selection, with a fallback model if the first fails. Credentials are resolved by the provider at run time, never stored in workflow JSON.

### Layer 3 — Tool / app connectors: what agents can do in the real world

- **Generic MCP servers:** any MCP-compatible client can discover and call tools from them. This is the default way to add a new tool.
- **OpenConnector (OOMOL), self-hosted:** an open-source connector gateway that sits between agents and apps, holds every credential behind its own boundary, and gives agents a clean catalog of actions to discover and call via SDK, CLI, MCP, or HTTP. Its MCP tools include `list_apps`, `list_connections`, `search_actions`, `get_action_guide`, and `execute_action`. This is how Agent Town reaches Gmail, Slack, GitHub, Notion, and 1,000+ other apps without putting a single provider token in an agent's config.
  - License check before publishing as a service: OpenConnector uses a modified Apache license, and providing it as a hosted service whose primary value is OpenConnector requires a commercial license from OOMOL, while releases up to and including v1.9.4 remain under unmodified Apache 2.0. Self-hosting for the user's own use is the safe starting point for this prototype.
- **Built-in tools:** file, shell (sandboxed), web search, git — each with an approval policy.
- **Tool allowlists are per agent, per team.** Read tools, write tools, send tools, and spend tools are different approval categories. No tool call in the send/spend category runs without human approval.

## OpenCode, first runtime — not the only runtime

Agent Town sits in front of a local OpenCode server:

Agent Town backend (localhost only) → OpenCode server (`localhost:4096`, HTTP + SSE) → the user's OpenCode subscription / Zen models

- Run OpenCode headless with `opencode serve`, no UI.
- One OpenCode session per Agent Task node. Map OpenCode SSE events to Agent Town events (thinking, tool use, waiting, done, failed), and pass the previous node's output as context to the next.
- The typed client is `@opencode-ai/sdk` in v1.

**Version warning — Milestone 0 must come first:** OpenCode 2.0 is a breaking overhaul (one background service, rebuilt API, v1 plugins / server integrations no longer work, new packages `@opencode/sdk` and `@opencode/client`). Run `opencode --version`, `opencode models`, and `opencode debug config` on the user's machine first, pin that version, and build the adapter against *that* API. Do not guess from docs for the other version. Do not hardcode the subscription tier: detect it from the local OpenCode setup (Zen is a pay-per-use gateway via `OPENCODE_API_KEY` at `https://opencode.ai/zen/v1`; Go is the $10/month tier).

## The event model — the core

Every visual change must come from a real event, never a timer pretending to work:

- Agent: id, role, department, desk position, status
- Status values: idle, thinking, working, waiting-for-human, done, failed
- Task: id, title, stage (inbox → doing → review → done), assignee, output link
- Event: type, from agent, to agent, task id, timestamp, message / tool used, runtime, cost (when reported by the adapter)

That one stream drives the office floor, the workflow graph, the Kanban board, the message feed, the activity log, and the cost panel. If the stream stops, the office stops. If a workflow node is not running, its agent does not animate as working.

## Views — all driven by the same event stream

- **Office view:** pixel office; desks are derived from the team in the current run; agents move by real status, with speech bubbles for "waiting for you" or "reviewing".
- **Graph view:** the workflow itself, with the active node highlighted — this is the builder *and* the live view.
- **Board view:** tasks by stage, Kanban-style.
- **Messages / logs / cost:** agent-to-agent handoffs, tool calls, connector actions, and runtime session events, in order, with the runtime and connector that produced each event.
- **Controls:** pause, redirect a task, approve / reject a review, stop the run.

## Stack

- Frontend: Next.js + TypeScript + Tailwind, React Flow for the workflow builder, Canvas pixel office for the office view.
- Backend: Node.js / TypeScript.
  - Workflow engine: interprets workflow JSON, walks nodes, handles parallel / branch / approval pauses, checks adapter capabilities before running.
  - Runtime Adapter Registry: loads adapters by manifest, routes Agent Task nodes to the right adapter, normalizes their events.
  - Connector Registry: loads MCP servers, OpenConnector, and built-in tools; enforces per-agent tool allowlists and approval categories.
  - Event bus + SQLite for runs, teams, workflows, messages, cost.
  - Mock engine: same workflow engine, fake agents, zero subscription spend — for testing the builders and UI first.
- Storage: SQLite for runs, tasks, messages, and token cost, plus a Markdown vault for outputs.
- No direct LLM calls in Agent Town's core. Everything goes through a runtime adapter, so the user's subscriptions are the model sources, not hardcoded keys in the app.

## Build order

- **Milestone 0 — interface + verify OpenCode:** define the Runtime Adapter and Connector contracts, the capability manifest, and the normalized event model. Verify the local OpenCode version, models, a single `opencode run` smoke test, and a session via `serve` + SDK. Stop here if this fails — do not build UI on a broken runtime.
- **Milestone 1 — builders + mock engine:** create/edit/delete teams and workflows, workflow JSON schema v1 with import/export, office + graph + board views running on mock events.
- **Milestone 2 — OpenCode adapter + connectors:** real runs through OpenCode, parallel nodes, output passing, failure handling, cost tracking from OpenCode events; generic MCP + self-hosted OpenConnector with tool allowlists and approval gates.
- **Milestone 3 — second runtime proof:** add Claude Code as a second adapter, and run the same demo workflow on it. Success means a new adapter file, not a core rewrite.
- **Milestone 4 — expand only on demand:** Codex / Gemini via ACP, then LangGraph / CrewAI / OpenClaw framework adapters.

Realistic estimate: about 2 weeks part-time for Milestones 0–2, plus Milestone 3. The builders and the adapter interface are the extra work, but they are the whole point of v0.3.

## Demo script to prove it (as a user-created workflow)

Goal: "Create a launch brief for a new neighbourhood coffee shop."
Researcher gathers competitors and pricing, Writer drafts positioning and copy, Developer builds a one-page HTML landing draft, Reviewer checks facts and consistency, CEO merges it into a final brief + landing page. That exercises every role, a handoff, a review rejection, and a real file output. In v0.3, this demo must be buildable as a user-created workflow, not a hardcoded one, and runnable on at least two runtimes by Milestone 3.

## Done criteria for v0.3

- Run the demo end-to-end in mock mode with no keys.
- Run the same demo end-to-end through OpenCode, and again through a second runtime (Claude Code) by Milestone 3.
- Run a demo task that uses a connector (for example, read a GitHub issue or a Notion page via OpenConnector / MCP) with the credential staying behind the connector gateway.
- Pause mid-run, reassign a task, and resume.
- Every agent status on screen matches its last event.
- The run produces at least 2 saved files (brief + landing page).
- Total token cost is visible, with a cap that stops the run.
- No agent can send, publish, or spend anything without the user's click.

## Main risks and fixes

- Too many agents chatting = token blowup. Fix: short handoffs, no free-form debate in v0.3, per-agent cost caps.
- Visualization drifting from reality. Fix: single event stream, no independent animation timers.
- Adapter sprawl. Fix: one interface, two implementations first (OpenCode + Mock, then Claude Code). Do not add a third runtime until the second one proves the interface.
- Connector credential leaks. Fix: credentials live behind the connector gateway / provider vault, never in workflow JSON, never in logs.
- Scope creep into 3D, multi-user, or 64 agents. Fix: that is after this prototype proves the loop.

## Constraints

- Localhost only for the prototype. Never expose an OpenCode server publicly — use `OPENCODE_SERVER_PASSWORD` and localhost only.
- Never commit `~/.local/share/opencode/auth.json`, or any other credential file, to the repo.
- No external send, publish, or spend without human approval.
- No workflow, team, or agent definition may require a code change.
- Do not hardcode the OpenCode version, model, or subscription tier — detect and pin them in Milestone 0.

## Naming note

There is already an unrelated GitHub visualization library called agent-town. "Agent Town" is fine as the product name, but for publishing, use a repo slug like `agent-town-app` or `agent-town-office` until the user decides to fight for the plain name.

## Instructions for Claude Code — start implementation

1. Start with Milestone 0. Report the detected OpenCode version, models, and subscription setup back to the user before writing runtime code, and pin the version you build against.
2. Build Milestones 0–1 first, demo them in mock mode, and get the user's approval before spending any subscription credit on real runs.
3. Implement Milestone 2 (OpenCode adapter + MCP / OpenConnector) next, then Milestone 3 (Claude Code as the second runtime proof).
4. If any step requires a core rewrite to add a new runtime or connector, stop and flag it — that means the interface needs fixing, not the core.
5. Do not publish, share, or deploy anything publicly, and do not spend, send, or publish on the user's behalf, without explicit approval in that step.
