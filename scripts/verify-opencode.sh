#!/usr/bin/env bash
# Milestone 0 — verify the local OpenCode setup BEFORE any OpenCode adapter code is written.
#
# Usage:
#   scripts/verify-opencode.sh            # free checks only: version, models, config, auth providers
#   scripts/verify-opencode.sh --serve    # + start `opencode serve` on 127.0.0.1 and check a session via the SDK (no prompt)
#   scripts/verify-opencode.sh --smoke    # + one tiny `opencode run` prompt  (SPENDS a little credit)
#   scripts/verify-opencode.sh --serve --smoke   # + one tiny prompt through the SDK session too (SPENDS)
#
# Output goes to the terminal and to m0-opencode-report.txt (git-ignored).
# Secrets are redacted, but READ THE REPORT before pasting it anywhere.

set -u
SERVE=0
SMOKE=0
for a in "$@"; do
  case "$a" in
    --serve) SERVE=1 ;;
    --smoke) SMOKE=1 ;;
    *) echo "unknown flag $a"; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/m0-opencode-report.txt"
: > "$REPORT"
log() { printf '%s\n' "$*" | tee -a "$REPORT"; }
redact() {
  # Mask values of anything that looks like a credential.
  sed -E \
    -e 's/("?[A-Za-z0-9_]*([Kk]ey|KEY|[Tt]oken|TOKEN|[Ss]ecret|SECRET|[Pp]assword|PASSWORD|[Aa]uth|AUTH)[A-Za-z0-9_]*"?[[:space:]]*[:=][[:space:]]*)"?[^",[:space:]}]+"?/\1"***"/g' \
    -e 's/(sk-|pk-|ghp_|gho_|xox[bap]-)[A-Za-z0-9_-]{6,}/\1***/g'
}
section() { log ""; log "== $* =="; }

log "Agent Town — Milestone 0 OpenCode report"
log "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "os: $(uname -srm)"
log "node: $(node --version 2>/dev/null || echo 'not found')"

if ! command -v opencode >/dev/null 2>&1; then
  log "opencode: NOT FOUND on PATH. Install OpenCode first, then re-run."
  exit 1
fi

section "opencode --version"
VERSION="$(opencode --version 2>&1 | tail -n1)"
log "$VERSION"
MAJOR="$(printf '%s' "$VERSION" | grep -oE '[0-9]+' | head -n1)"
if [ "${MAJOR:-0}" -ge 2 ]; then
  log "NOTE: OpenCode 2.x detected — the adapter must target @opencode/sdk / @opencode/client, not @opencode-ai/sdk v1."
else
  log "NOTE: OpenCode 1.x detected — the adapter will target @opencode-ai/sdk pinned to this version."
fi

section "opencode models"
opencode models 2>&1 | redact | tee -a "$REPORT"

section "opencode debug config (redacted)"
opencode debug config 2>&1 | redact | tee -a "$REPORT"

section "subscription / provider setup (names only, never values)"
if [ -n "${OPENCODE_API_KEY:-}" ]; then log "OPENCODE_API_KEY: set (Zen pay-per-use gateway likely)"; else log "OPENCODE_API_KEY: not set"; fi
AUTH="${XDG_DATA_HOME:-$HOME/.local/share}/opencode/auth.json"
if [ -f "$AUTH" ]; then
  if command -v node >/dev/null 2>&1; then
    node -e 'const a=require(process.argv[1]); for (const [k,v] of Object.entries(a)) console.log(`provider: ${k} (type: ${v && v.type || "?"})`)' "$AUTH" 2>&1 | tee -a "$REPORT"
  else
    log "auth.json present (install node to list provider names)"
  fi
else
  log "auth.json: not found at $AUTH"
fi
log "(Agent Town never reads or copies auth.json; this only lists provider names.)"

if [ "$SMOKE" = 1 ]; then
  section "opencode run smoke test (spends a little credit)"
  opencode run "Reply with exactly: AGENT_TOWN_OK" 2>&1 | tail -n 20 | redact | tee -a "$REPORT"
fi

if [ "$SERVE" = 1 ]; then
  section "opencode serve + SDK session (localhost only)"
  PORT=4096
  export OPENCODE_SERVER_PASSWORD="${OPENCODE_SERVER_PASSWORD:-$(node -e 'console.log(require("crypto").randomBytes(12).toString("hex"))')}"
  mkdir -p "$ROOT/.m0"
  opencode serve --hostname 127.0.0.1 --port "$PORT" > "$ROOT/.m0/serve.log" 2>&1 &
  SERVE_PID=$!
  trap 'kill $SERVE_PID 2>/dev/null' EXIT
  for _ in $(seq 1 30); do
    curl -s -o /dev/null "http://127.0.0.1:$PORT" && break
    sleep 0.5
  done
  if [ "${MAJOR:-0}" -ge 2 ]; then SDK_PKG="@opencode/sdk"; else SDK_PKG="@opencode-ai/sdk@$(printf '%s' "$VERSION" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)"; fi
  log "installing $SDK_PKG into .m0/ (not saved to package.json)"
  npm install --silent --no-save --prefix "$ROOT/.m0" "$SDK_PKG" >/dev/null 2>&1 || npm install --silent --no-save --prefix "$ROOT/.m0" "${SDK_PKG%@*}" >/dev/null 2>&1
  cp "$ROOT/scripts/opencode-sdk-check.mjs" "$ROOT/.m0/"  # must sit next to .m0/node_modules
  (cd "$ROOT/.m0" && OPENCODE_URL="http://127.0.0.1:$PORT" M0_PROMPT="$SMOKE" node opencode-sdk-check.mjs) 2>&1 | redact | tee -a "$REPORT"
  log "serve log (tail):"
  tail -n 15 "$ROOT/.m0/serve.log" 2>/dev/null | redact | tee -a "$REPORT"
fi

log ""
log "Report written to $REPORT — review it, then paste it into the Agent Town chat / docs/milestone-0-opencode.md."
