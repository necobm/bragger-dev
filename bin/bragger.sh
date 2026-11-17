#!/usr/bin/env bash
# Launches bragger-dev for the current OS user:
#   1. starts the local server (loopback only, random port) unless one is already running,
#   2. opens the UI in a Chrome/Chromium app window with a dedicated profile.
# Closing the window started by this script stops the server it started.
#
# Env overrides: BRAGGER_DATA_DIR, BRAGGER_BROWSER (browser executable).
set -euo pipefail

APP_NAME="bragger-dev"
APP_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
DATA_DIR="${BRAGGER_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/$APP_NAME}"
if [[ -n "${XDG_RUNTIME_DIR:-}" ]]; then RUN_DIR="$XDG_RUNTIME_DIR/$APP_NAME"; else RUN_DIR="$DATA_DIR/run"; fi
SERVER_FILE="$RUN_DIR/server.json"
LOG_FILE="$DATA_DIR/logs/server.log"

die() { echo "bragger: $*" >&2; exit 1; }

find_browser() {
  local candidate
  for candidate in "${BRAGGER_BROWSER:-}" google-chrome-stable google-chrome chromium chromium-browser; do
    if [[ -n "$candidate" ]] && command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

# Prints the URL of a running, reachable server; fails otherwise.
running_server_url() {
  [[ -f "$SERVER_FILE" ]] || return 1
  local port pid
  port="$(sed -n 's/.*"port":\([0-9]*\).*/\1/p' "$SERVER_FILE")"
  pid="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$SERVER_FILE")"
  [[ -n "$port" && -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null || return 1
  echo "http://127.0.0.1:$port"
}

open_window() {
  "$BROWSER" --app="$1" \
    --user-data-dir="$DATA_DIR/chrome-profile" \
    --class="$APP_NAME" \
    --no-first-run --no-default-browser-check \
    >/dev/null 2>&1
}

# --- preflight ---------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node.js >= 22 is required"
(( $(node -p 'process.versions.node.split(".")[0]') >= 22 )) || die "Node.js >= 22 is required (found $(node -v))"
[[ -f "$APP_DIR/dist/server/index.js" ]] || die "App is not built. Run: (cd '$APP_DIR' && npm ci && npm run build)"
BROWSER="$(find_browser)" || die "Google Chrome or Chromium not found (set BRAGGER_BROWSER)"

mkdir -p "$DATA_DIR/logs"
chmod 700 "$DATA_DIR"

# --- already running: just open another window ------------------------------
if url="$(running_server_url)"; then
  open_window "$url" &
  disown
  exit 0
fi

# --- start server --------------------------------------------------------------
BRAGGER_DATA_DIR="$DATA_DIR" NODE_ENV=production \
  nohup node "$APP_DIR/dist/server/index.js" >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

url=""
for _ in $(seq 1 50); do
  if url="$(running_server_url)"; then break; fi
  kill -0 "$SERVER_PID" 2>/dev/null || die "Server failed to start, see $LOG_FILE"
  sleep 0.2
done
[[ -n "$url" ]] || die "Server did not become ready, see $LOG_FILE"

echo "bragger: running at $url (logs: $LOG_FILE)"
open_window "$url" # blocks until the window is closed
