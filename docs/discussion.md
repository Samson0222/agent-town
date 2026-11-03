# Discussion log

Newest first. Record decisions and open points from each session.

## 2026-11-03 — Office switched to pixel-agents; Multica-style agents & skills; step-list workflows

User asks: simpler agent and workflow creation like Multica; agents designed like pixel-agents; agents always visible in the office (never disappear).

### Decisions (user choices)
1. **Office = pixel-agents engine + art** (MIT), vendored in `packages/pixel-office`. It replaces the agent-town town renderer, which has been removed.
2. **Behaviour (pixel-agents' rules):**
   - every agent owns a desk and is always in the office
   - working: sits and types or reads
   - waiting for you: stays seated with a "…" bubble
   - done: ✓, then strolls and rests at the desk
   - idle: strolls

   **This updates the earlier `ambient:false` decision:** strolling is allowed *only while an agent is not working*, so the office never fakes work.
3. **New Office page** (`/office`): the team is always on screen. It shows a live run if one is active, otherwise everyone idles.
4. **Shared agent list** (Multica style): agents live in one library and teams pick from it. *(in progress)*
5. **Skills** (Multica style), recommended to and accepted by the user:
   - write a skill in the app
   - import a skill folder
   - a few starter skills

   A skill is reusable know-how (`SKILL.md` plus files), attached to agents and switchable per agent. *(in progress)*
6. **Step-list workflow mode** as the default way to make workflows; the graph stays as "advanced". *(in progress)*

### Decisions made while the user was away (item 1)
- **Desks for everyone.** A "work seat" is a chair facing a work desk; the lounge coffee table doesn't count. When a team has more agents than work seats, the office grows downward. The last interior row is duplicated, so walls and floors stay consistent, and 3×3 pods (desk + PC + bench, the default layout's own pod) are added, **only in the room that already has work desks**. The first attempt also put desks in the kitchen, because a small table there counted as a desk; that's fixed. This is our own code (`packages/pixel-office/src/desks.ts`) and the engine is untouched.
- **Seat choice.** New agents are given a free *work* seat explicitly. Otherwise the engine could seat a working agent on the sofa.
- **Zoom.** Whole-number zoom at 2× and above (crisp); below that, quarter steps, so a big office doesn't drop to a tiny 1×. Quarter steps cause slight floor shimmer, which is acceptable.
- **Turbopack and `.js` imports.** Turbopack can't resolve `./x.js` to `x.ts`, and it has no extension-alias option (checked in Next 16's bundled docs). So the `.js` suffix is stripped from relative imports in vendored files by one documented sed command, the only change to upstream code.
- **The hydration error seen once** was stale dev-server state after editing the sidebar. A clean restart showed no errors.

### Fixes
- A React warning on graph nodes (mixing `border` / `borderColor` with `borderLeft*`): every side is now set individually. The browser check now clicks graph nodes.
- OpenCode check: installs inside `.m0/`, never hangs on the event stream, masks org ids.

## 2026-11-03 — UI redesign + alignment done

- **Office:** the npm `agent-town@0.2.0` package contains no JavaScript, so the upstream source is vendored at commit 78e8e91 (MIT) in `packages/office-renderer`. Local changes are only the two patches in `patches/` (ambient switch, overflow crash fix), documented in UPSTREAM.md.
- **Town is the default scene** (most vivid: buildings per task stage, characters walk between them). There is a scene picker for office / space station / farm / lab / rocket / pirate ship.
- Wrapper rules:
  - statuses map at the boundary (waiting-for-human → `waiting_approval` + "Waiting for you!")
  - outfit colour = the agent's colour, so the roster and the town match
  - the stage is sized to the scene's shape, with no letterbox
- **UX:**
  - Start page asks "What should your team work on?" and auto-checks readiness.
  - Run page puts approvals in a banner you can't miss, shows the team roster, a plain-English feed (raw log behind a toggle), and steps with Reassign / Add instruction.
  - Clicking an agent opens a drawer with their task, output and activity.
- **Alignment:**
  - reducer tracks the current tool and tokens (OpenClaw Office)
  - AI Agent Office vault layout + `step_runs` + `_run.md`
  - Agent Factory importer (format only)

## 2026-11-03 — OpenCode report received; UI redesign requested

- **OpenCode 2.2.0** on the user's machine. Providers: OpenCode Go, OpenCode Zen (org), and OpenRouter. Pin `@opencode/client@2.2.0`. Details in milestone-0-opencode.md.
- In 2.x, `@opencode/sdk` is an in-process host. We use `@opencode/client` against `opencode serve` (matches the brief: backend → localhost server).
- The user identified **"AI Agent Office" = [Imangali7/ai-agent-office](https://github.com/Imangali7/ai-agent-office)** (MIT). Use only its SQLite (`workforce_os.db`) + numbered Markdown vault pattern (`00-INBOX … 07-SYSTEM`, outputs in `04-OUTPUTS`). Do not use its fixed CEO orchestrator.
- The user chose: use the agent-town library with a small patch (no ambient behaviour); write our own Agent Factory importer (GPL: format only); do the alignment work now.
- **User feedback:** the current UI is unfriendly and unintuitive, and the hand-drawn office is ugly. Redesign the layout and make the characters and office more vivid. This comes first.

## 2026-11-03 — Reference projects were not used (miss) → review done

- The user asked why the reference projects weren't used. **Answer: a miss on my side.** Session 1 built from the brief's short descriptions without looking up the real repos, and didn't flag that before implementing. The office renderer in particular was hand-written, against the brief ("do not build a pixel renderer from scratch").
- **Fix:** cloned and read the repos. Findings and recommendations are in [reference-review.md](reference-review.md). Highlights:
  - The `agent-town` npm library (MIT) should replace our office, but it has built-in random ambient behaviour that must be disabled with a small patch.
  - Agent Factory is **GPL-3.0**: support its template *format* with our own importer and copy no code.
  - "AI Agent Office" is not identified yet; ask the user.
- **Process rule from now on:** before building any part the brief says to reuse or copy, find and read the reference first, and state which parts are reused, which are adapted, and which are our own.

## 2026-11-03 — User is on Windows 11

- Running `scripts/verify-opencode.sh` on Windows opened the "Select an app" dialog, because Windows can't run `.sh` files.
- **Decision:** every user-facing script runs through Node so it works on Windows. Added `npm run verify:opencode` (`scripts/verify-opencode.mjs`). The `.sh` file stays as a macOS/Linux equivalent.
- Fixed `scripts/dev.mjs` for Windows: it now spawns npm through a shell (Node refuses to spawn `.cmd` files without one) and stops child processes with `taskkill /T`.
- Fixed both verify scripts: the SDK check now runs from inside `.m0/`, so it imports the SDK installed there.
- Going forward, test commands and paths with Windows in mind (PowerShell, `\` paths, `.cmd` shims).

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
