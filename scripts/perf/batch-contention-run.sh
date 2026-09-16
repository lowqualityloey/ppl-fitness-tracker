#!/usr/bin/env bash
# M4-02 (#91) — the batch contention measurement, end to end, in one command.
#
#   1. build (UNMODIFIED tree) -> start the production server on :3001
#   2. SOLO baseline   : 1 batch client, no background load (the condition G-M3-4 was set under)
#   3. CONTENDED pair  : 2 batch clients + 8 background clients (the RFC's missing condition)
#   4. PLAYWRIGHT under contention : the real browser drain (G-M3-4 in tests/e2e/sla.spec.ts)
#      streams while step 3's driver runs again in the background
#   5. a SOLO playwright control afterwards, so a browser-side miss can be attributed to
#      contention rather than to the 4-core box running Playwright at all (item 33's venue law)
#
# Every number is stamped with its denominator; nothing here can move a budget.
# Deliberately not in CI: local stack, production build, shared-runner machines cannot host
# this venue (#90's law: shapes transfer, milliseconds are machine properties).
set -u
cd "$(git rev-parse --show-toplevel)"
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"   # chrome-launcher WSL quirk, #122
export LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu          # local Chromium venue
set -a; source .env.local; set +a

SRV=0
start_server() {
  node_modules/.bin/next start --port 3001 > /tmp/ppl-contention-server.log 2>&1 &
  SRV=$!
  for i in $(seq 1 90); do
    curl -sf -o /dev/null http://localhost:3001/ && { echo "  server_ready_after=${i}s BUILD_ID=$(cat .next/BUILD_ID)"; return 0; }
    sleep 1
  done
  echo "  SERVER DID NOT START"; return 1
}
stop_server() {
  kill "${SRV:-0}" 2>/dev/null; sleep 2
  # Bracket pattern — a plain pkill would SIGTERM this script itself (see #122).
  for p in $(ps -eo pid,args | awk '/next-serve[r]/ {print $1}'); do kill "$p" 2>/dev/null; done
  echo "  listeners_after_stop=$(ss -ltn 2>/dev/null | grep -c ':3001')"
}
grep_lines() { grep -E "^LABEL|^HOST|^BATCH|^BG-|^VERDICT|^\[G-M3-4\]"; }
# The pipe to grep swallows the driver's exit code (1 = budget MISSED). Capture it per leg.
leg() {
  local tag="$1"; shift
  npm run perf:contention -- "$@" > "/tmp/ppl-contention-${tag}.log" 2>&1
  local code=$?
  grep_lines < "/tmp/ppl-contention-${tag}.log"
  echo "  driver_exit=${code} (1 = batch p95 MISSED the 5 s budget — recorded, never fatal to the run)"
}

DURATION="${DURATION:-45}"

echo "HOST nproc=$(nproc) load=$(cat /proc/loadavg)"
echo "### BUILD (unmodified tree)"
npm run build > /tmp/ppl-contention-build.log 2>&1; echo "  build_exit=$? BUILD_ID=$(cat .next/BUILD_ID)"
start_server || exit 1

echo; echo "### 1/5 SOLO BASELINE — 1 batch client, no background load (--duration=20)"
leg solo --duration=20 --batch-users=1 --bg-users=0 --label=solo

echo; echo "### 2/5 CONTENDED — 2 batch x 60-mutations + 8 background clients (--duration=${DURATION})"
leg contended --duration="${DURATION}" --label=contended

echo; echo "### 3/5 PLAYWRIGHT G-M3-4 DRAIN UNDER CONTENTION (driver streams in background)"
npm run perf:contention -- --duration=$((DURATION + 30)) --label=bg-for-playwright > /tmp/ppl-contention-driver3.log 2>&1 &
DRV=$!
sleep 5   # let the streams reach steady state before the browser starts measuring
echo "  driver_pid=${DRV} BUILD_ID_AT_START=$(cat .next/BUILD_ID)"
node_modules/.bin/playwright test tests/e2e/sla.spec.ts -g "G-M3-4" 2>&1 | grep -E "\[G-M3-4\]|passed|failed" || true
wait "${DRV}"; echo "  driver exit=$? (1 = batch p95 missed the budget by design; print it, never hide it)"
grep -E "^LABEL|^HOST|^BATCH-ACCEPTED|^BATCH-APPLIED|^VERDICT" /tmp/ppl-contention-driver3.log

echo; echo "### 4/5 PLAYWRIGHT G-M3-4 SOLO CONTROL (quiet server, attribution baseline)"
node_modules/.bin/playwright test tests/e2e/sla.spec.ts -g "G-M3-4" 2>&1 | grep -E "\[G-M3-4\]|passed|failed" || true

echo; echo "### 5/5 TAIL"
stop_server
echo "HOST load_final=$(cat /proc/loadavg)"
echo "  git status: $(git status --porcelain | tr '\n' ' ')"
echo DONE
