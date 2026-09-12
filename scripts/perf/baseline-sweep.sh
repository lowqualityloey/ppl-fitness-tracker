#!/usr/bin/env bash
# M4-01 (#90) — pilot, 50 rps baseline and the user-count sweep, as run on 2026-09-13.
#
# The sweep IS the card's negative scenario: fixed 50 rps offered with fewer users than the run demands, so
# per-user load crosses the 120 req/min budget (2 rps/user) and 429 interference should become visible.
# What it actually produced was 401 interference instead, because the route verifies the session BEFORE the
# limiter counts it — recorded in docs/perf/2026-09-12-m4-90-load-harness-design.md and filed as #125.
#
# The scenario is therefore NOT yet genuinely run; re-run this after #125 lands.
set -u
cd "$(git rev-parse --show-toplevel)"
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"
set -a; source .env.local; set +a

echo "HOST  nproc=$(nproc) load_before=$(cat /proc/loadavg)"
echo "=== build (unmodified tree) ==="
npm run next:build > /tmp/ppl-perf-build.log 2>&1
echo "build_exit=$?"
tail -2 /tmp/ppl-perf-build.log

node_modules/.bin/next start --port 3001 > /tmp/ppl-perf-server.log 2>&1 &
SRV=$!
echo "server_pid=$SRV"
for i in $(seq 1 60); do
  curl -sf -o /dev/null http://localhost:3001/ && { echo "server_ready_after=${i}s"; break; }
  sleep 1
done
grep -m1 "Next.js" /tmp/ppl-perf-server.log

echo
echo "=== PILOT: 5 users, 10 rps, 15 s ==="
npm run perf:sync -- --users=5 --rps=10 --duration=15 --label=pilot 2>&1 | grep -vE "^$|^>"

echo
echo "=== BASELINE: 30 users, 50 rps, 60 s ==="
npm run perf:sync -- --users=30 --rps=50 --duration=60 --label=base 2>&1 | grep -vE "^$|^>"

echo
echo "=== SWEEP: fixed 50 rps, fewer users than the run demands ==="
for u in 20 10 4; do
  echo "--- users=$u (per-user $((50/u+1)) rps requested, budget is 2 rps/user) ---"
  npm run perf:sync -- --users=$u --rps=50 --duration=20 --label="sweep$u" 2>&1 | grep -E "OFFERED|ACCEPTED|REJECTED|AUTH|LIMITER|VERDICT"
done

echo "HOST  load_after=$(cat /proc/loadavg)"
kill "$SRV" 2>/dev/null; sleep 2
for p in $(ps -eo pid,args | awk '/next-serve[r]/ {print $1}'); do kill "$p" 2>/dev/null; done
echo "port_3001_listeners_after_kill=$(ss -ltn 2>/dev/null | grep -c ':3001')"
echo DONE
