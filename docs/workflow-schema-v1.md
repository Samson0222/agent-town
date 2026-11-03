# Workflow JSON — schema v1

The single source of truth for a workflow. It can be imported and exported from the Workflows page, or through `GET /api/workflows/:id/export` and `POST /api/workflows/import[?teamId=]`. The authoritative definition is `packages/core/src/schema/workflow.ts`.

```jsonc
{
  "schemaVersion": 1,            // required; other versions are rejected (future: migrateWorkflow)
  "id": "launch-brief",
  "name": "Launch Brief",
  "description": "",
  "revision": 3,                 // bumped by the server on every save
  "teamId": "launch-team",       // agents are referenced by id within this team
  "inputs": [ { "key": "goal", "label": "Goal", "type": "longtext", "required": true, "default": "…" } ],
  "entryNodeIds": ["research"],  // optional; default = nodes with no incoming edge
  "nodes": [ /* see below */ ],
  "edges": [ { "id": "e1", "source": "research", "target": "copy", "label": "optional",
               "condition": { "type": "always" } } ],
  "settings": { "costCapUsd": 0.5, "handoffMaxChars": 4000 }
}
```

No credentials, ever. Models and keys live with the team, agent and runtime, and credentials are resolved at run time.

## Nodes

Every node has `id`, `type`, `label`, `position {x,y}`, `maxRuns` (default 3) and a type-specific `config`.

| type | config | behaviour |
|---|---|---|
| `agentTask` | `agentId`, `prompt`, `outputFile?`, `requires[]` | Runs one prompt on the agent's runtime. Output is saved to `steps/<id>-<n>.md`, and to `outputFile` if set (`.html` asks for HTML). |
| `parallel` | — | Fans out on all outgoing edges at once. |
| `branch` | — | Passes the input through. The first matching edge wins; `default` is the else path. |
| `toolCall` | `tool` (`connector.tool`), `args{}` (string values are templates), `agentId?` | Calls a connector tool under that agent's allowlist. send/spend (and write without auto-approve) pause for approval. Outcome is `approved` / `rejected`. |
| `humanApproval` | `message`, `agentId?` | Waits for your click. Outcome is `approved` / `rejected`, and a reject note is passed back as feedback. |
| `merge` | `agentId?`, `prompt`, `outputFile?`, `requires[]` | Waits until nothing active can still reach it, then concatenates or synthesizes with the agent. |
| `end` | — | Marks completion. The run ends when no work is left. |

## Edge conditions

Conditions are tested against the source node's result:

`always` · `contains {value}` · `notContains {value}` · `equals {value}` · `matches {value: regex}` · `approved` · `rejected` · `default`

Text conditions are case-insensitive. `always` is not taken after a rejection.

## Prompt templates

| Placeholder | Meaning |
|---|---|
| `{{input.<key>}}` | Run input. |
| `{{nodes.<nodeId>.output}}` | Latest output of any node (truncated to `handoffMaxChars`). |
| `{{upstream}}` | Outputs handed to this activation. Appended automatically if not used. |
| `{{feedback}}` | Output of the node that sent work back (on re-runs). Appended automatically if not used. |

User redirect notes are appended as "Instructions from the user".
