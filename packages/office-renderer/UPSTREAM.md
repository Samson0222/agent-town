# Vendored: rafapetter/agent-town

- Upstream: https://github.com/rafapetter/agent-town (MIT, see LICENSE)
- Commit: `78e8e91` (2026-03-09), copied from `src/` unchanged
- Why vendored instead of `npm install agent-town`: the published npm package `agent-town@0.2.0` contains no JavaScript (only README, LICENSE, package.json and a tsbuildinfo), so it cannot be installed as a dependency.

## Local patches

Every change from upstream is listed here and kept in `patches/`, so it can be re-applied on a newer upstream or sent as an upstream PR.

| Patch | Why |
|---|---|
| `patches/0001-ambient-setting.patch` | Adds `TownSettings.ambient` (default `true`, the upstream behaviour). With `ambient: false`, the library does not roam, take coffee breaks, chat, high-five or stretch, and shows no random idle speech bubbles. Agent Town's brief requires every visual change to come from a real event, so we run with `ambient: false`. |
