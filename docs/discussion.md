# Discussion log

Newest first. Record decisions and open points from each session.

## 2026-11-03 — Kick-off (session 1)

### Decisions
1. **OpenCode verification happens on the user's machine.** The build runs in a cloud container with no OpenCode or credentials, so it can't see the local setup. We build the runtime-independent parts now. The user runs `scripts/verify-opencode.sh` locally and shares the report. No OpenCode adapter code is written until that report is in and the version is pinned. *(User chose "Contracts now, you verify".)*
2. **Scope of session 1 = M0 contracts + M1 mock**, stopping for review before any real runtime spend. *(User choice.)*
3. **Repo layout = npm workspaces monorepo**: `packages/core` (no UI, no runtime imports), `apps/server` (Node, SQLite, SSE), `apps/web` (Next.js + Tailwind + React Flow). *(User choice.)*
4. **Events are the source of truth for runs.** Tasks, messages and cost are projections built by one pure reducer (`reduceRunState`), which the server, the UI and replay all share. A status can only appear on screen if an event put it there.
5. **Tools that need approval are never given to a runtime session.** A runtime can't pause mid-prompt for a click, so send/spend tools (and write tools unless auto-approved) only run through a gated **Tool Call** node. Found and fixed during the session-1 browser test: the mock runtime briefly "used" the CEO's send tool without approval.
6. **Pause semantics:** pause lets in-flight steps finish and starts no new ones. Reassign works on any step that isn't running.
7. **Generated HTML is never executed on the app origin.** The server serves it as `text/plain`, and the UI previews it in a `sandbox=""` iframe.
8. **Node 22.13+** is required so the built-in `node:sqlite` works (no native build step). Revisit if the user's machine has an older Node.

### Open points (need the user)
- **OpenCode report**: run `scripts/verify-opencode.sh` (free), then optionally `--serve` (free) and `--smoke` (spends a few cents), and share the output. See [milestone-0-opencode.md](milestone-0-opencode.md).
- **Approve the M1 mock demo** before M2 spends any credit.
- **Repo slug**: the brief suggests `agent-town-app` / `agent-town-office` for publishing. The current repo is the private `agent-town`, which is fine until publishing comes up.
- **OpenConnector**: self-hosted, used only by the user (license note in the brief). Confirm before M2 whether it already runs locally and which app the demo should use (GitHub issue or Notion page).
- **Claude Code runtime (M3)**: confirm whether to use the Agent SDK (TypeScript) or the `claude` CLI in headless mode. Both fit the adapter contract.
