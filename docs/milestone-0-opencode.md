# Milestone 0 — verify OpenCode on your machine

The brief requires checking the **real** local OpenCode before writing the adapter: version, models, config, a smoke test, and a `serve` + SDK session. The development container can't do this because it has no OpenCode and no credentials. You run it locally and share the report.

## Run it

Run these from the repo root, in any terminal: **Windows PowerShell / VS Code terminal**, macOS or Linux. They need Node 22.13+.

```bash
npm run verify:opencode
```

This is free. It runs `opencode --version`, `opencode models`, `opencode debug config` (redacted) and lists provider *names* from your auth file, never the values.

```bash
npm run verify:opencode -- --serve
```

Also free. It starts `opencode serve` on `127.0.0.1:4096` with a random `OPENCODE_SERVER_PASSWORD`, installs the SDK that matches your version into `.m0/` (git-ignored), and creates and deletes one session. It prints which SDK methods exist, so the adapter is built against your real API rather than the docs.

```bash
npm run verify:opencode -- --serve --smoke
```

**This spends a little credit.** It sends one tiny `opencode run` prompt and one SDK prompt, which shows how cost and tokens are reported.

The report is written to `m0-opencode-report.txt` (git-ignored). **Read it before sharing.** Keys and tokens are redacted, but check anyway.

> On Windows, don't run `scripts/verify-opencode.sh` directly, because Windows will ask which app should open it. Use the `npm run` commands above; the `.sh` file is an equivalent for macOS/Linux only.

## What happens next

1. Paste the report in chat, or add it under *Results* below.
2. Claude pins the version:
   - **1.x**: `@opencode-ai/sdk@<your version>`
   - **2.x**: `@opencode/sdk` / `@opencode/client` (breaking overhaul)
3. Claude writes `packages/adapters/opencode` against that API. It maps the SSE events to the normalized `RuntimeEvent`s: thinking, text, tool_use, tool_result, waiting, cost, done, failed.
4. The subscription tier is **detected, not hardcoded**: a Zen pay-per-use key (`OPENCODE_API_KEY`) versus the Go subscription, judged from providers and models.

## Safety rules (from the brief)
- `opencode serve` binds to `127.0.0.1` only and always gets `OPENCODE_SERVER_PASSWORD`.
- `~/.local/share/opencode/auth.json` is never read for values, copied, or committed.
- No real prompt runs until you approve M1 and say go.

## Results

_Not run yet._

| Item | Value |
|---|---|
| OpenCode version (pinned) | — |
| SDK package | — |
| Models available | — |
| Subscription / gateway | — |
| Smoke test | — |
| serve + SDK session | — |
