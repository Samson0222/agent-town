# Architecture

Agent Town is a runtime-agnostic core with three pluggable layers. The core never imports a runtime, a model provider, or a SaaS API.

```
apps/web (Next.js)  ──HTTP + SSE──▶  apps/server (Node, 127.0.0.1:4317)
   views = reduceRunState(events)        │  SQLite (teams, workflows, runs, events)
                                         │  Markdown vault  data/vault/runs/<runId>/
                                         ▼
                              packages/core  (no UI, no runtime imports)
              ┌───────────────┬───────────────────┬──────────────────────┐
              │ WorkflowEngine │ RuntimeAdapter     │ ConnectorRegistry    │
              │ + preflight    │ Registry (Layer 1) │ (Layer 3)            │
              └───────────────┴─────────┬──────────┴──────────┬───────────┘
                                        ▼                     ▼
                         Mock │ OpenCode (M2) │ Claude    vault │ mock-chat │ MCP (M2)
                         Code (M3) │ ACP / frameworks (M4)    OpenConnector (M2) │ built-ins
```

Model providers (Layer 2) sit *behind* runtimes. An agent names a model id and an optional fallback, and the runtime resolves the credentials. No key ever enters workflow JSON, team JSON, events or logs.

## Packages

| Path | Contents |
|---|---|
| `packages/core/src/schema` | `Team` / `AgentTemplate` and `Workflow` v1 (zod). The single source of truth for data shapes. |
| `packages/core/src/events.ts` | The normalized event model. |
| `packages/core/src/adapters/contract.ts` | The runtime adapter contract and capability manifest. |
| `packages/core/src/adapters/mock.ts` | Mock runtime with deterministic, zero-cost output. |
| `packages/core/src/connectors/*` | The connector contract, a registry with allowlists and approval categories, and built-in/mock connectors. |
| `packages/core/src/engine/*` | Workflow engine, preflight, graph helpers, prompt templating. |
| `packages/core/src/state/reducer.ts` | `reduceRunState(events)`: the projection every view uses. |
| `packages/core/src/templates` | Starter templates. They are plain data and examples only. |
| `apps/server` | Store (`node:sqlite`), disk vault, REST + SSE. Localhost only. |
| `apps/web` | Team builder (+ Agent Factory import), workflow builder (React Flow), run view (office, graph, board, activity, steps, cost, outputs, replay). |
| `packages/office-renderer` | Vendored [rafapetter/agent-town](https://github.com/rafapetter/agent-town) pixel renderer (MIT) plus documented patches; wrapped by `apps/web/components/Office.tsx`. |
| `packages/adapter-opencode` | OpenCode 2.2.0 runtime adapter (`@opencode/client@2.2.0`); opt-in via `AGENT_TOWN_OPENCODE_URL`. |
| `packages/pixel-office` | pixel-agents office engine + art (MIT) with Agent Town's controller, loader and desk planner. |
| `packages/core/src/importers` | Agent Factory role-template importer (our code; format only). |

`@agent-town/core` (root export) is browser-safe and is what the web app imports. `@agent-town/core/engine` is used by the server.

## Layer 1 — runtime adapter contract

```ts
interface RuntimeAdapter {
  manifest: CapabilityManifest;          // id, version, runtimeVersion, kind, capabilities, spendsCredit
  startSession(opts): Promise<{ sessionId }>;
  sendPrompt(sessionId, prompt): Promise<void>;
  streamEvents(sessionId): AsyncIterable<RuntimeEvent>;   // ends after done/failed
  cancel(sessionId); getStatus(sessionId); getCost(sessionId);
  listModels(); listCapabilities(); closeSession?(sessionId);
}
```

Normalized `RuntimeEvent`s: `thinking`, `text`, `tool_use`, `tool_result`, `waiting`, `cost`, `log`, `done`, `failed`.

Well-known capabilities: `streaming`, `subagents`, `fileEdit`, `toolUse`, `toolAllowlist`, `costReporting`, `cancellation`, `systemPrompt`, `modelSelection`. Custom strings are allowed.

**Rule:** a new runtime is a new file that implements this interface, registered in `apps/server/src/app.ts`. If that needs an engine change, the interface is wrong, so stop and fix the interface.

## Layer 3 — connector contract

```ts
interface Connector { manifest; listTools(): ToolDescriptor[]; callTool(name, args, ctx): ToolResult }
ToolDescriptor.category ∈ read | write | send | spend
```

`ConnectorRegistry.authorize(toolId, agent)` checks the agent's allowlist (`"*"`, `"connector.*"`, `"connector.tool"`) and decides whether approval is needed:
- **send / spend:** always need approval. This is hardcoded and not configurable. `execute()` also refuses them without an approval token, as a second line of defence.
- **write:** needs approval unless the agent has `permissions.autoApproveWrite`.
- **read:** no approval needed.

Runtime sessions only receive tools that need **no** approval. Approval-gated tools run only through Tool Call nodes (decision 2026-11-03 #5).

## Event model

Every event carries `seq` (monotonic per run), `runId`, `ts`, and optionally `from`, `to`, `taskId`, `nodeId`, `runtime`, `connector` and `cost`. Types:

`run.started | run.paused | run.resumed | run.completed | run.failed | run.stopped | preflight | node.queued | node.started | node.completed | node.failed | agent.status | task.created | task.stage | task.reassigned | task.redirected | message | runtime.event | tool.call | tool.result | approval.requested | approval.resolved | output.saved | cost`

- Agent statuses: `idle, thinking, working, waiting-for-human, done, failed`.
- Task stages: `inbox → doing → review → done`.

The server persists every event and fans it out over SSE (`/api/runs/:id/stream`, resumable with `Last-Event-ID` or `?after=`). The UI keeps the event array and renders `reduceRunState(events)`. Replay is the same reducer cut at a sequence number.

## Engine semantics

- **Entry:** `entryNodeIds` if set, otherwise every node with no incoming edge.
- **Routing:** after a node finishes, edges are evaluated against its result `{output, outcome}`.
  - Branch nodes take the first matching edge in order, otherwise the `default` edges.
  - Other nodes take every matching edge, otherwise the `default` edges.
  - `always` is not taken after a rejection.
- **Parallel fan-out:** every outgoing edge runs at once (any node may fan out; the Parallel node makes it explicit).
- **Merge / Synthesis:** collects inputs and fires once no queued, running or waiting node can still reach it. Without an agent it concatenates; with an agent it runs a synthesis prompt.
- **Loops:** an edge back to an earlier node re-queues it with `feedback` (the sender's output) plus its own previous output. `maxRuns` per node (default 3) stops runaway loops by failing the run.
- **Tasks:** Agent Task, Merge and Tool Call nodes each get one task. A task sits in **review** while some active node could still send work back to it, and moves to **done** after that.
- **Human approval:** emits `approval.requested`, marks the assignee `waiting-for-human`, and waits for `approve(approvalId, approved, note)`. The outcome drives `approved` / `rejected` edges.
- **Handoffs:** each downstream prompt gets the upstream outputs, truncated to `settings.handoffMaxChars`.
- **Cost:** adapters report cost (`cost` events, or `getCost` as a fallback). The run stops when the run cap (workflow override or team default) or an agent's cap is exceeded.
- **Fallback model:** if a session fails and the agent has `model.fallbackId`, the step is retried once on the fallback.
- **Failure:** a failed step fails the run and cancels sessions still in flight.
- **Controls:**
  - `pause`: no new steps start; in-flight steps finish.
  - `resume`: steps start again.
  - `stop`: cancels sessions and rejects pending approvals.
  - `reassign(nodeId, agentId)`: only for steps that aren't running; the new agent is capability-checked first.
  - `redirect(nodeId, note)`: the note is added to that step's next prompt.
- **Preflight (before every run):** checks graph structure, team match, required inputs, that agents and runtimes exist, and node `requires` against adapter capabilities (errors). It also checks that tool calls are allowed (errors). It warns when an adapter lacks cost reporting, cancellation or allowlist enforcement, or when a model isn't listed.

## Storage layout

- **SQLite** (`data/agent-town.db`):
  - `teams`, `workflows`
  - `runs` (snapshot of workflow and team, `vault_dir`)
  - `events` (the source of truth)
  - `step_runs` (one row per step attempt: agent, runtime, model, status, duration, tokens, cost; projected from events)
- **Vault** (`data/vault/`), following AI Agent Office:
  - `<team vault>/00-INBOX … 07-SYSTEM`
  - each run writes to `<team vault>/04-OUTPUTS/<YYYY-MM-DD>-<workflow>-<run8>/`: deliverables, `steps/<node>-<attempt>.md`, and `_run.md` (a metadata header plus the step table)

## Office view

The `Office` wrapper pushes `reduceRunState(events)` into the renderer and nothing else. Agent statuses map to renderer activities (`thinking → planning`, `working → coding / reading / searching / reviewing` by current tool, `waiting-for-human → waiting_approval`, `done → success`, `failed → error`, paused run → `paused`). Task stages map to renderer stages (`inbox → todo`, `doing → in_progress`, `review`, `done`). The renderer runs with `ambient: false` (patch 0001), so characters only move when an event changes their status or task.

## Security / safety
- Both the server and Next dev bind to `127.0.0.1`. CORS accepts only localhost origins, and other origins get 403.
- Vault paths are confined to the run folder.
- Generated HTML is served as `text/plain` and previewed in `sandbox=""`.
- `.gitignore` excludes `data/`, `.env*`, `auth.json`, and M0 reports.

## Decisions
See [discussion.md](discussion.md) for the dated log. Key structural ones:
1. Events are the source of truth; tasks, messages and cost are projections.
2. Approval-gated tools never go to runtime sessions.
3. `node:sqlite` (Node ≥ 22.13), so there is no native dependency.
4. Workflow schema v1 carries `schemaVersion: 1` plus a content `revision` that is bumped on each save. `migrateWorkflow` is the hook for future versions.
5. A run snapshots its workflow and team, so later edits never change a past run's replay.
