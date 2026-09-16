#!/usr/bin/env bash
# M4-02 (#91) AC-2, solo configuration — the discriminating control.
#
# Why this exists next to batch-contention-control.sh: the first control run showed the
# CONTESTED configuration misses the 5 s budget on an UNMODIFIED build (baseline p50
# 8218 ms). That is the card's headline finding, not an instrument failure — but it means
# "revert and re-measure green" is unsatisfiable in the contended config, and an injected
# 6.5 s sleep cannot be discriminated against noise when reality is already at 6–12 s.
# The discrimination belongs to the SOLO configuration (1 batch client, no background —
# the condition G-M3-4 was set under, where unmodified is green at ~1.7–1.9 s):
#
#   solo baseline (unmodified build)  -> expect HOLDS / PASSES
#   solo injected (6500 ms in the apply transaction, scratch) -> expect MISSES (~8 s)
#   solo restored (revert + rebuild)  -> expect HOLDS / PASSES again
#
# plus the browser leg (Playwright G-M3-4) at each point, so both instruments — driver
# verdict line and the real drain — are watched cross the budget and back.
# The injection is anchor-asserted, reverted by this script, never committed; git status
# prints at the end. ~13 min: two rebuilds.
set -u
cd "$(git rev-parse --show-toplevel)"
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"   # chrome-launcher WSL quirk, #122
export LD_LIBRARY_PATH=/tmp/pw-libs/extracted/usr/lib/x86_64-linux-gnu
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
  for p in $(ps -eo pid,args | awk '/next-serve[r]/ {print $1}'); do kill "$p" 2>/dev/null; done
  echo "  listeners_after_stop=$(ss -ltn 2>/dev/null | grep -c ':3001')"
}
solo_legs() {
  local tag="$1"
  npm run perf:contention -- --duration=25 --batch-users=1 --bg-users=0 --label="solo-$tag" > "/tmp/ppl-contention-solo-$tag.log" 2>&1
  local code=$?
  grep -E "^LABEL|^HOST|^BATCH-ACCEPTED|^BATCH-APPLIED|^VERDICT" "/tmp/ppl-contention-solo-$tag.log"
  echo "  driver_exit=${code} (solo config: 0=HOLDS expected un-injected, 1=MISSES expected injected)"
  node_modules/.bin/playwright test tests/e2e/sla.spec.ts -g "G-M3-4" > "/tmp/ppl-contention-solo-spec-$tag.log" 2>&1
  local pw=$?
  grep -E "\[G-M3-4\]|passed|failed" "/tmp/ppl-contention-solo-spec-$tag.log" || true
  echo "  playwright_exit=${pw} (asserts the 15 s hang ceiling; the [G-M3-4] line is the 5 s verdict)"
}

echo "HOST nproc=$(nproc) load=$(cat /proc/loadavg)"
[ -n "$(git status --porcelain lib/repositories/workout-repository.ts)" ] && { echo "  tree already dirty at the injection file; refusing"; exit 1; }

echo "### 1/3 SOLO BASELINE (unmodified tree -> build)"
npm run build > /tmp/ppl-contention-solo-build0.log 2>&1; echo "  build_exit=$? BUILD_ID=$(cat .next/BUILD_ID)"
start_server || exit 1
solo_legs baseline
stop_server

echo; echo "### 2/3 SOLO + INJECTED (6500 ms inside the applySync transaction)"
python3 - <<'PY'
p = 'lib/repositories/workout-repository.ts'
s = open(p).read()
anchor = "      const session = await this.lockSession(tx, userId, request.mutations[0]?.sessionId);"
assert s.count(anchor) == 1, "anchor moved; refusing to inject blind"
injection = (
    "      // M4-02 CONTROL INJECTION - temporary, reverted by this script, never committed.\n"
    "      await new Promise((resolve) => setTimeout(resolve, 6500));\n"
)
open(p, 'w').write(s.replace(anchor, injection + anchor, 1))
print("  injected")
PY
npm run build > /tmp/ppl-contention-solo-build1.log 2>&1; echo "  build_exit=$?"
start_server || { git checkout -- lib/repositories/workout-repository.ts; exit 1; }
solo_legs injected
stop_server

echo; echo "### 3/3 REVERT + REBUILD + RE-MEASURE SOLO (must be green again)"
git checkout -- lib/repositories/workout-repository.ts
echo "  injection file modified after revert: $(git status --porcelain lib/repositories/workout-repository.ts | wc -l) entries"
npm run build > /tmp/ppl-contention-solo-build2.log 2>&1; echo "  build_exit=$?"
start_server || exit 1
solo_legs restored
stop_server
echo "HOST load_final=$(cat /proc/loadavg)"
echo "  git status: $(git status --porcelain | tr '\n' ' ')"
echo DONE
