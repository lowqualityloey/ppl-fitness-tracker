#!/usr/bin/env bash
# M4-01 (#90) — the §4 item 16 control, exactly as run on 2026-09-13.
#
# What it does: ladder (find a rate this machine can actually deliver) -> baseline on an UNMODIFIED
# production build -> inject a 500 ms sleep into the measured path of POST /api/sync -> rebuild -> measure ->
# revert -> rebuild -> measure. Three numbers, same configuration.
#
# Honest-use notes:
#   * The injection is applied to the working tree and reverted BY THIS SCRIPT. It is never committed, and the
#     last line prints git status so a reader can see that only tsconfig.json (D6) remains.
#   * The verdict rests on the MEDIAN. At n~20 the "p95" is the second-largest observation
#     (ceil(20*0.95)-1 = 18) and it swung 261/312/545 ms across identical code. See
#     docs/perf/2026-09-12-m4-90-load-harness-design.md.
#   * Deliberately not in CI: this needs the local stack, a production build, and a machine that is not a
#     shared runner.
set -u
cd "$(git rev-parse --show-toplevel)"
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)"   # chrome-launcher WSL quirk, #122
set -a; source .env.local; set +a

CFG="--users=1 --rps=1 --duration=20"
SRV=0
start_server() {
  node_modules/.bin/next start --port 3001 > /tmp/ppl-perf-server.log 2>&1 &
  SRV=$!
  for i in $(seq 1 60); do
    curl -sf -o /dev/null http://localhost:3001/ && { echo "  server_ready_after=${i}s"; return 0; }
    sleep 1
  done
  echo "  SERVER DID NOT START"; return 1
}
stop_server() {
  kill "${SRV:-0}" 2>/dev/null; sleep 2
  # Bracket pattern: a plain `pkill -f 'next start'` also matches this script's own command line and has
  # already SIGTERMed a session in this project.
  for p in $(ps -eo pid,args | awk '/next-serve[r]/ {print $1}'); do kill "$p" 2>/dev/null; done
  echo "  listeners_after_stop=$(ss -ltn 2>/dev/null | grep -c ':3001')"
}
run() { npm run perf:sync -- $CFG --label="$1" 2>&1 | grep -E "^OFFERED|^ACCEPTED|^CLIENT|^VERDICT|^AUTH|^REJECTED|^DB-SIDE"; }

echo "HOST nproc=$(nproc) load=$(cat /proc/loadavg)"
echo "### LADDER (find a delivered rate; each 15 s)"
start_server || exit 1
for c in "--users=1 --rps=1 --duration=15" "--users=2 --rps=2 --duration=15" "--users=5 --rps=5 --duration=15"; do
  echo "--- $c ---"
  npm run perf:sync -- $c --label=ladder 2>&1 | grep -E "^OFFERED|^ACCEPTED|^CLIENT|^VERDICT"
done
echo; echo "### CONTROL BASELINE ($CFG, unmodified build)"
run baseline
stop_server

echo; echo "### INJECT 500ms sleep into the /api/sync measured path"
python3 - <<'PY'
p = 'src/app/api/sync/route.ts'
s = open(p).read()
anchor = "    const repository = new WorkoutRepository(getDb(), context.claims);"
assert s.count(anchor) == 1, "anchor moved; refusing to inject blind"
injection = (
    "    // M4-01 CONTROL INJECTION - temporary, reverted by the control script, never committed.\n"
    "    await new Promise((resolve) => setTimeout(resolve, 500));\n"
)
open(p, 'w').write(s.replace(anchor, injection + anchor, 1))
print("  injected")
PY
grep -n "CONTROL INJECTION" src/app/api/sync/route.ts | head -1
npm run build > /tmp/ppl-perf-build1.log 2>&1; echo "  build_exit=$?"
start_server || exit 1
echo "### CONTROL RUN (same config, +500 ms injected)"
run injected
stop_server

echo; echo "### REVERT + REBUILD + RE-MEASURE"
git checkout -- src/app/api/sync/route.ts
echo "  route.ts modified after revert: $(git status --porcelain src/app/api/sync/route.ts | wc -l) entries"
npm run build > /tmp/ppl-perf-build2.log 2>&1; echo "  build_exit=$?"
start_server || exit 1
echo "### CONTROL RESTORED (third number)"
run restored
stop_server
echo "HOST load_final=$(cat /proc/loadavg)"
echo "  git status: $(git status --porcelain | tr '\n' ' ')"
echo DONE
