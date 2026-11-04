# Discussion log

Newest first. Record decisions and open points from each session.

## 2026-11-04 — Item 1 done: office upgrades

The user approved the order (office upgrades → hosted access → 2D/3D → external reporting). The domain for hosting is **devsam.my**.

**Decisions:**
- **Shared helpers in core** (`state/office.ts`): `officeActivity`, `officeMeetings` and `isSimulatedRun`. The future 3D view will use the same helpers, so both views always agree.
- **Statuses.** The tool in use decides the activity: terminal (shell/exec), browsing (web/fetch/http), reading (read/search/list), coding (write/edit/save), otherwise working.
  - "Needs you" is a red pulsing pill.
  - "Done ✓" shows for 3.5 s with a sparkle, together with a double hop in the office.
- **Meetings.** An agent meets the teammate whose work it is handling while that teammate's task is in **review** (the engine's own review stage).
  - This works out to: the reviewer checking a draft meets the writer. Plain handoffs don't trigger meetings, so the office isn't always in meetings.
  - New reducer fields: `AgentState.collaborator`, taken from the last handoff or feedback message when the agent's step starts, and `RunState.handoffFrom`. Both are additive, so old runs replay unchanged.
  - Both people walk to the lounge sofa (non-desk seats) and sit there until the review ends, then return to their desks. If the lounge is full they stay at their desks. The partner's pill reads "With <name>".
- **Simulated.** A "Simulated" chip shows when every agent in the run uses the practice runtime.
- **Phones.** Below 640 px the agent drawer becomes a bottom sheet.

**Bug found and fixed:** a step-list workflow whose **first** step had a review loop couldn't start ("no entry node"), because the loop points back at the first step. `buildGraphFromSteps` now always sets `entryNodeIds`. Existing step-list workflows get the fix the next time they are saved.

## 2026-11-04 — Borrow ideas from @btcup99's 3D office post; public hosting for logged-in users; 2D/3D switch

The user asked to borrow the post's ideas, to host Agent Town publicly for authenticated users only, and to add a switch between a 2D and a 3D office.

**User choices:**
1. **Hosting:** your PC plus a Cloudflare Tunnel. Agent Town, OpenCode and the logins stay on the PC, and no router ports are opened.
2. **Users:** you as owner, plus invited people with roles (operator, viewer).
3. **Login:** Cloudflare Access, with Agent Town checking the login again.

**Decisions:**
- **Two API ports.** The tunnel arrives from localhost too, so "localhost" can't mean "owner". The tunnel reaches only a port that requires a valid login.
- **Roles are stored in Agent Town,** not Cloudflare. Send and spend approvals stay with the owner. Operators get a daily budget.
- **`actor` on events** (an additive schema change) gives an audit trail.
- **The localhost-only rule in AGENTS.md changes** to "bind to localhost; the only public way in is authenticated". The brief said localhost "for the prototype", so this follows the user's explicit decision.
- **The 3D office is a second view** of the same state, behind an `OfficeView` interface. It uses Three.js (MIT) with our own low-poly models (CC0 assets only if any are used). Phones default to 2D.
- **Order proposed:**
  1. office upgrades (small)
  2. hosted access
  3. 2D/3D switch
  4. external reporting

  Waiting for the user to confirm the order.

## 2026-11-04 — Can we use vercel-labs/agent-desktop?

Reviewed (reference-review.md §8). It's an Apache-2.0 computer-use tool (accessibility tree → refs → click/type), served over MCP. It would plug in as a **connector**, not a runtime, once the M2 MCP connector exists.

**Open decision for the user:** how desktop actions get approved inside an agent's loop:
- (a) auto-approve writes for chosen agents and apps, or
- (b) a per-action approval that pauses the session (the same `respond()` hook as for OpenCode permissions).

Snapshots need redacting in logs. Nothing built yet.

## 2026-11-04 — Feedback: GitHub install from a repo link; agent avatars

1. **GitHub install from a repo link failed** (user tried `https://github.com/ayghri/i-have-adhd`). The repo has no SKILL.md at its root; the skill is in `skills/i-have-adhd/`, with a copy in `.cursor/skills/i-have-adhd/`. Before, we only showed an error asking for a deeper URL.
   - Now Agent Town looks inside the link. It lists only the outermost skill folders (sub-skills belong to their parent) and ignores copies in hidden tool folders (`.cursor/`, `.claude/`, …).
   - With one skill left, it previews that skill straight away and adds a note saying where it was found. With several, it shows a list to pick from (`{choices}` response). With none, it says so clearly.
   - "Update from source" returns 409 if the folder has moved upstream.
   - Still not tried against real GitHub, because this container gets 403. The UI was checked with a stubbed response, and the logic with fake-GitHub tests.
2. **Agents showed a letter instead of a character.** Agents moved over from old teams (or created by import/API) had no office character.
   - The store now gives every agent without a `char-N` the least-used character when it is saved, and fills in missing ones at startup.
   - To change an agent's look, open the agent → **Change look** (under the avatar) or **Settings → Look**.

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

### Decisions made while the user was away (item 2)
- **Team = membership.** `Team.memberIds` points into the agent library. The store resolves `agents` (and the skills they use) when reading a team, so the engine, preflight and runs didn't change, and run snapshots stay self-contained.
- **Migration** (runs at server start, and whenever a team arrives with embedded agents and no members):
  - same id and same content → one shared agent
  - same id but different content → renamed `<id>-<team>`, and that team's workflows are updated
  - tested on a real database from before this change: 14 agents, 2 clashes (`editor`, `pm`) resolved, the research workflow remapped
- **Starter agents** got globally unique ids (`research-editor`, `copy-editor`), a one-line description, and a fixed office character, so roster avatars and office characters match.
- **"Use template"** creates fresh agent copies (`<id>-<suffix>`), so editing a copy never changes the original.
- **Deleting an agent** is refused while a workflow step uses it (the step would break). Removing it from a team keeps it in the library.
- **Avatar = office character.** The New agent flow offers the 6 pixel-agents characters plus a colour, and the office uses the same character (no hue shift), so they always match. Agents without a chosen character keep initials avatars.
- **Runtime step** lists the registered runtimes. OpenCode / Claude Code show as "appear here once switched on" (no real runs in the prototype).
- **Multica license** (Apache-2.0 + hosting/embedding conditions): we followed its *layout and flow* (3 steps, Identity / Behavior & capabilities sections, Now / Recent work + side card). No Multica code was used.

### Decisions made while the user was away (item 3)
- **Skill model:** `SKILL.md` body + extra text files + `scope` (`global` | `agents`) + `source` (manual / folder / starter / github) + `origin` for GitHub (`repo, path, ref, commit, url`).
- **How scope is stored per agent:** for a global skill only an explicit **off** is stored on the agent (`enabled:false`); for an agent-scoped skill only an explicit **on**. Changing a skill's scope resets per-agent choices, because the meaning flips.
- **In the prompt:** if the runtime has the new `skills` capability (OpenCode 2.x has `session.skill`), skills are passed natively. Otherwise they're appended after the instructions as `## Skills you can use` → `### Skill: <name>` + "Use when" + body + files. A `skills.loaded` event records which skills each step had, and the mock runtime echoes them, so it's visible in demos.
- **GitHub install safety:**
  - the ref is resolved to a commit SHA, and every file is fetched from `raw.githubusercontent.com/<sha>/…`, so what you previewed is exactly what's saved
  - binaries skipped; limits of 60 files, 200 KB per file, 1 MB total
  - nested skills excluded
  - scripts stored as text, flagged in the preview and in the editor, and never executed
  - `GITHUB_TOKEN` is used only if set on the server (rate limits) and never stored or logged
  - "Update from source" re-resolves the same ref, shows old → new commit, and only applies on click
- **Not verified against real GitHub** (this container gets 403 from api.github.com). It's covered by a fake-GitHub test suite.
- **lucide-react has no GitHub logo** (brand icons were removed), so a neutral git-branch icon is used.
- **Starter skills** were written for Agent Town: Fact-check checklist, Brand voice guide (global), Landing page style guide, Short handoffs (global).

### Decisions made while the user was away (item 4)
- **One source of truth:** the step list is stored in the workflow JSON as `simple.steps`, and the graph (`nodes` / `edges`) is **generated from it on every save and import** (`syncSimpleWorkflow`, server-side). The engine still runs only the graph, and exports carry both.
- **What each toggle generates** (deterministic ids `s-<step>`, `s-<step>-review`, `s-<step>-ok`, `s-<step>-approval`, `p-<n>`, `m-<n>`):
  - **review loop:** reviewer step (asked for VERDICT) → Decision: approve continues, otherwise back to the step
  - **needs my approval:** Your approval: approved continues, rejected goes back to the step with your note
  - **parallel with previous:** consecutive parallel steps share a Run-in-parallel → … → Combine-results stage
- **Every step prompt** is prefixed with `Goal: {{input.goal}}`. Earlier results are added automatically by the engine.
- **"Edit as graph (advanced)"** keeps the graph generated from the current (possibly unsaved) steps and drops the step list, after a confirm. There is no automatic graph → steps conversion (most graphs can't be expressed as a list).
- **New workflows default to step-list mode** (one step for the team's first member). `mode: "graph"` on the API still creates a graph workflow. Starter templates stay as graphs (they use tool calls).

### Decisions made while the user was away (item 5)
- **Adapter package:** `packages/adapter-opencode`, a new adapter file as the brief requires. Core only gained *optional, additive* fields: `SessionOptions.permissions`, `SessionOptions.skills`, and the `skills` capability. No engine rewrite.
- **Client:** `@opencode/client@2.2.0` (the HTTP client for `opencode serve`), pinned. The adapter depends on a small `OpenCodeClientLike` interface so tests can use a fake, and a compile-time check proves the real client satisfies it.
- **Caught by that check:** the real `event.subscribe` takes **one** options object (`{ types, signal }`) and returns the stream directly. My first version (and the M0 check script) passed `signal` as a second argument, so a real stream would never have been cancelled. Both are fixed.
- **Instructions** go at the top of the prompt text (robust). OpenCode's instruction-entry API (`session.instructions.entry.put`) has unverified semantics, so it isn't used yet.
- **Skills** go in the prompt, not OpenCode's native `skills` field, which refers to skills installed in OpenCode.
- **Permissions:** an agent without shell permission gets a per-session OpenCode rule `shell * deny`. Your global OpenCode rules still apply on top.
- **Cost:** `session.usage.updated` carries cumulative cost and tokens, which are converted to deltas. Reasoning tokens count as output.
- **Sessions are kept** in OpenCode after each step (`keepSessions` defaults to true), so you can inspect them there.
- **Opt-in registration:** only when `AGENT_TOWN_OPENCODE_URL` points at localhost. `OPENCODE_SERVER_PASSWORD` is sent as Basic auth (`opencode:<pw>`, which worked in your M0 run) and never logged.
- **Open limitation:** `permission.asked` only shows "waiting for you, answer in OpenCode". Proposed contract addition: `RuntimeEvent.waiting.requestId` plus an optional `adapter.respond(sessionId, requestId, approved, note)` mapped to `permission.reply`, so Agent Town's approval banner can answer it. **Not built; needs your OK.**

### Fixes
- Run page: the technical log's long lines pushed the Steps panel under the sidebar. Columns now use `minmax(0,…)`, long tokens wrap, and Activity / Steps stack below 2xl width.
- The hydration error appeared again, after adding the Skills link to the sidebar: stale dev-server state, gone after a clean restart. **Rule:** restart the dev server after sidebar edits before browser checks.
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
