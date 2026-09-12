#!/usr/bin/env bash
# M4-01 (#90) — the 401 discriminator probe, as run on 2026-09-13.
#
# Question it answers: when POST /api/sync rejects under load, is the session invalid, or is the per-request
# `supabase.auth.getUser()` hop to GoTrue shedding and being reported as UNAUTHENTICATED?
#
# The discriminator is in the harness (scripts/perf-sync-load.ts), not here: each user keeps firing with the
# SAME cookie, so a 2xx that arrives after a 401 from that user proves the credential was valid. This script
# just runs two user counts at a client cap high enough that the client stops being the limit, and prints the
# AUTH line.
#
# Result that produced #125: 10 users / 50 rps -> 1003 of 1155 rejected, 10 of 10 users recovered on the same
# cookie. 30 users -> 1049 of 1147 rejected, 29 of 30 recovered. 429=0 throughout, because the route verifies
# the session BEFORE the limiter counts it.
#
# Reuses the .next bundle if present; app code must be unchanged (check `git diff --name-only <build-sha>..HEAD`).
set -u
cd "$(git rev-parse --show-toplevel)"
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"
set -a; source .env.local; set +a

echo "HOST nproc=$(nproc) load=$(cat /proc/loadavg)"
node_modules/.bin/next start --port 3001 > /tmp/ppl-perf-probe-server.log 2>&1 &
SRV=$!
for i in $(seq 1 60); do
  curl -sf -o /dev/null http://localhost:3001/ && { echo "ready_after=${i}s"; break; }
  sleep 1
done
grep -m1 "Next.js" /tmp/ppl-perf-probe-server.log

echo
echo "=== A: 30 users (1.67 rps/user, UNDER the 2 rps budget), cap 256, 25 s ==="
npm run perf:sync -- --users=30 --rps=50 --duration=25 --max-inflight=256 --label=probeA 2>&1 | grep -vE "^$|^>"

echo
echo "=== B: 10 users (5 rps/user, OVER the budget -> 429s expected IF auth were clean), cap 256, 25 s ==="
npm run perf:sync -- --users=10 --rps=50 --duration=25 --max-inflight=256 --label=probeB 2>&1 | grep -vE "^$|^>"

echo "HOST load_after=$(cat /proc/loadavg)"
kill "$SRV" 2>/dev/null; sleep 2
for p in $(ps -eo pid,args | awk '/next-serve[r]/ {print $1}'); do kill "$p" 2>/dev/null; done
echo "listeners_after=$(ss -ltn 2>/dev/null | grep -c ':3001')"
echo DONE
