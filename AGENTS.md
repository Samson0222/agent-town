# Agent Town: rules for coding agents

Agent Town is a local, visual multi-agent office. Read `docs/README.md` first, then `docs/progress-tracker.md` for where things stand. The product brief is `docs/brief-v0.3.md`.

## Safety (never break these)
- **Bind to localhost; the only public way in is authenticated.** Every server and the web app bind to `127.0.0.1`. The only public route is the Cloudflare Tunnel behind Cloudflare Access, and Agent Town checks the login and the role again on the tunnel-only API port (see `docs/hosting.md`). Never expose the OpenCode server or the local API port; protect OpenCode with `OPENCODE_SERVER_PASSWORD`. Switching the tunnel on is the user's step.
- **No credentials in the repo.** Never commit `~/.local/share/opencode/auth.json`, `.env*` or any key or token. No key goes into workflow, team or agent JSON, events or logs.
- **No real runs, no spend, nothing published without the user's explicit OK.** This covers real model runs, external sends, upstream PRs and package publishing.
- **Approval-gated tools never go to runtime sessions.** Send and spend always need human approval; write needs it unless the agent auto-approves writes.

## Architecture
- **Events are the source of truth.** Every view is `reduceRunState(events)`; replay uses the same reducer.
- **Teams, agents, skills and workflows are data.** None of them may require a code change.
- **Don't hardcode** the OpenCode version, a model or a pricing tier.
- **A new runtime is one adapter file** that implements the contract in `packages/core/src/adapters/contract.ts`. If it needs an engine or core rewrite, stop and flag it.
- **The core stays runtime-agnostic.** `packages/core` never imports a runtime, model provider or SaaS API.

## Reference projects and licenses
- **Read a reference before reusing it,** and record the review in `docs/reference-review.md`.
- **Multica:** design only, no code.
- **Agent Factory:** GPL, so format only, no code.
- **AI Agent Office:** only its SQLite + Markdown vault pattern.
- **pixel-agents:** MIT and vendored. Keep `packages/pixel-office/UPSTREAM.md` (commit, license, JIK-A-4 Metro City credit) up to date.

## UI
- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.
- Plain English for people, not internal ids or jargon.

## Workflow
- Before every commit run `npm test` and `npm run typecheck`. Also do a browser check: no console errors, and click through the pages you touched (including the builder).
- **Windows-friendly scripts only** (the user is on Windows 11): use Node scripts, not bash-only ones.
- Record every decision and problem in `docs/discussion.md` (newest first) and `docs/progress-tracker.md`.
- If something blocks you, write down the problem and your workaround, then move on to the next item.
- Commit after each working item, with a clear message.
