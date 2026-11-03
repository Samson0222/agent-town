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

Run on the user's machine (Windows 11, Node v24.22.1) on 2026-11-03 with `--serve`, no smoke test.

| Item | Value |
|---|---|
| OpenCode version | **2.2.0** (pin: `@opencode/client@2.2.0`) |
| Client package | `@opencode/client`: `OpenCode.make({ baseUrl, headers })`. Note: in 2.x `@opencode/sdk` is an **in-process host**, not an HTTP client, so we use `@opencode/client` to talk to `opencode serve`, as the brief describes. |
| Providers | `opencode` ("Personal / OpenCode", Zen gateway with an org header), `opencode-go` (**OpenCode Go** subscription), `openrouter` (API key in auth.json) |
| Models | ~30 `opencode-go/*`, ~40 `opencode/*` (some disabled in config), many `openrouter/*` |
| `OPENCODE_API_KEY` | not set |
| Tier detection rule | `opencode-go` provider present → Go subscription; `opencode` provider → Zen (pay per use); `openrouter` → OpenRouter key. Detected at runtime, never hardcoded. |
| User permission config | Global allow, with ask on `.env` reads and external dirs; denies `git push`, `git reset --hard`, `rm -rf` etc. The adapter must respect these, and `permission.asked` events should map to our *waiting-for-human* status. |
| `opencode serve` | reachable on 127.0.0.1:4096 ✅ |
| SDK session check | ⏸ The first run used the wrong package (`@opencode/sdk`). The check is fixed to use `@opencode/client`; **re-run needed**. |

### 2.x client surface (read from `@opencode/client@2.2.0` type definitions)
- `session.create({ title, model: { id, providerID }, location: { directory } })`, `session.prompt({ sessionID, text })`, `session.wait`, `session.interrupt` (→ our cancel), `session.context`, `session.remove`
- `model.list`, `provider.list`, `agent.list`, `server.info`
- `event.subscribe({ types })` → an async iterable of typed events, including:
  - `session.execution.started / succeeded / failed / interrupted`
  - `session.text.delta`, `session.reasoning.delta`
  - `session.tool.called / success / failed`
  - `session.usage.updated`
  - `permission.asked / replied`
  - `session.status`, `session.idle`

  These map directly onto our normalized `RuntimeEvent`s.
- Still unknown until the re-run: the exact `OPENCODE_SERVER_PASSWORD` auth header format, and the payload shape of `session.usage.updated` (cost / tokens).
