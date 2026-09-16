#!/usr/bin/env bash
# M4-02 (#91) AC-2 — the watched-fail control for the contention instrument.
#
# Three numbers on the same configuration, exactly the #90 (control-run.sh) pattern:
#   baseline (unmodified build) -> inject a 6500 ms sleep INSIDE the applySync
#   transaction -> rebuild -> measure (must see the breach) -> revert -> rebuild ->
#   measure (must see it green again).
#
# The injection is one level deeper than #90's (which slept in the route handler before
# the repository was constructed): the card demands the sleep inside the apply
# transaction, so the instrument must detect slowness that lives *beneath* lock
# acquisition — this proves the client-observed latency attributes to apply, not to
# queueing in front of it. The sleep holds a pool connection for 6.5 s (pool ceiling 10,
# item 33), so a batch stream also contends the pool itself — a second honest signal.
#
# The Playwright leg is ALLOWED to exit red on the injected build: a red G-M3-4 there is
# the observation AC-2 asks for, and the exit code is captured, not swallowed.
#
# The injection is applied to the working tree and reverted BY THIS SCRIPT. It is never
# committed; the last lines print git status so a reader can see the tree is clean again.
set -u
cd "$(git rev-parse --show-toplevel)"
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"   # chrome-launcher WSL quirk, #122
export LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu
set -a; source .env.local; set +a

run() {
  npm run perf:contention -- --duration=25 --label="$1" > "/tmp/ppl-contention-run-$1.log" 2>&1
  local code=$?
  grep -E "^LABEL|^HOST|^BATCH-ACCEPTED|^BATCH-APPLIED|^VERDICT" "/tmp/ppl-contention-run-$1.log"
  echo "  driver_exit=${code} (1 = MISSED; that is the observation under --label=$1, never fatal to the control)"
}
playwright_leg() {
  # 1 = the spec's own budget assertion failed = the breach was observed = the product of this run.
  npm run perf:contention -- --duration=55 --label="$1-pw" > "/tmp/ppl-contention-pw-$1.log" 2>&1 &
  local drv=$!
  sleep 5
  node_modules/.bin/playwright test tests/e2e/sla.spec.ts -g "G-M3-4" > "/tmp/ppl-contention-pw-spec-$1.log" 2>&1
  local pw=$?
  grep -E "\[G-M3-4\]|passed|failed" "/tmp/ppl-contention-pw-spec-$1.log" || true
  wait "${drv}"; local drc=$?
  echo "  playwright_exit=${pw} driver_exit=${drc} (driver 1 under injected build is the AC-2 observation)"
  grep -E "^BATCH-ACCEPTED|^VERDICT" "/tmp/ppl-contention-pw-$1.log"
}
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
  for p in $(ps -eo pid,args | awk '/next-serve[r]/ {print $1}'); do kill "$p" 2>/dev/null; done
  echo "  listeners_after_stop=$(ss -ltn 2>/dev/null | grep -c ':3001')"
}

echo "HOST nproc=$(nproc) load=$(cat /proc/loadavg)"
echo "### CONTROL BASELINE (unmodified build)"
[ -n "$(git status --porcelain lib/repositories/workout-repository.ts)" ] && { echo "  tree already dirty at the injection file; refusing"; exit 1; }
npm run build > /tmp/ppl-contention-ctl-build0.log 2>&1; echo "  build_exit=$? BUILD_ID=$(cat .next/BUILD_ID)"
start_server || exit 1
run baseline
stop_server

echo; echo "### INJECT 6500 ms sleep inside the applySync transaction"
python3 - <<'PY'
p = 'lib/repositories/workout-repository.ts'
s = open(p).read()
anchor = "      const session = await this.lockSession(tx, userId, request.mutations[0]?.sessionId);"
assert s.count(anchor) == 1, "anchor moved; refusing to inject blind"
injection = (
    "      // M4-02 CONTROL INJECTION - temporary, reverted by the control script, never committed.\n"
    "      await new Promise((resolve) => setTimeout(resolve, 6500));\n"
)
open(p, 'w').write(s.replace(anchor, injection + anchor, 1))
print("  injected")
PY
grep -n "CONTROL INJECTION" lib/repositories/workout-repository.ts | head -1
npm run build > /tmp/ppl-contention-ctl-build1.log 2>&1; echo "  build_exit=$?"
start_server || exit 1
echo "### INJECTED — expect MISSES here (that is the point of this run)"
run injected
playwright_leg injected
stop_server

echo; echo "### REVERT + REBUILD + RE-MEASURE (expect the REAL contended numbers back: on this box the"
echo "### contended config misses UNMODIFIED — that is #91's finding, not an instrument fault. The"
echo "### AC-2 green/re-discrimination legs run in the solo config: batch-contention-solo-control.sh)"
git checkout -- lib/repositories/workout-repository.ts
echo "  injection file modified after revert: $(git status --porcelain lib/repositories/workout-repository.ts | wc -l) entries"
npm run build > /tmp/ppl-contention-ctl-build2.log 2>&1; echo "  build_exit=$?"
start_server || exit 1
run restored
playwright_leg restored
stop_server
echo "HOST load_final=$(cat /proc/loadavg)"
echo "  git status: $(git status --porcelain | tr '\n' ' ')"
echo DONE
