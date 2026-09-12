# M4-100 — Playwright contention ledger

Started 2026-09-12 on the `#80` branch, because pass C of that branch's merge battery is the first run in
this project's history where **the machine's capacity was recorded alongside its results**. Every row here
therefore carries a load denominator. A timing red with no load number attached is an anecdote; that is how
"contention is the best available explanation, not a proven one" (STATE §7 item 22) stayed true for a month.

## The denominator

- `nproc` on this box: **4**.
- Linux load average counts runnable **and** uninterruptible tasks; on 4 cores a 5-minute average of 6.5
  means the box was ~**1.7× oversubscribed**. A single e2e worker needing one core is then scheduled
  against a queue, and 4 s becomes 5 s.
- Named neighbors observed on 2026-09-12T14:32Z, none of them this repo's:
  - `node …/job-tracker/node_modules/.bin/vite preview --port 4173` — another project, up **80 619 s (~22 h)**.
  - a `~/.kiro-server` cluster (≥ 6 node processes) started **~5 100 s (~85 min)** earlier, i.e. it arrived
    mid-session and overlapped passes B and C.
  - `dsh web` (this harness), resident.
- Verified **not** strays from our own suite: nothing listening on :3000/:3001/:3101 after pass C, and
  `battery.sh` kills `[n]ext-server` before and after the e2e step. The earlier attribution of this family
  to "our own leftover servers" is not supported by what was on the box at the time.

## Standing rule for anyone running this file's experiments

Record `nproc`, `cat /proc/loadavg`, and the top CPU consumers immediately before and after each pass, in
this file, next to the result. If the 5-minute load exceeds 4.0, the pass is **not evidence about the
suite** — it is evidence about whatever else was running, and it does not count toward #100's
five-consecutive-green criterion. That is a fence on the *measurement*, not on the assertion: no gate,
budget, or SLA is weakened by it.

## Runs

### #80 branch `fix/m4-080-per-run-fixture-ids`, tree `9c83078` (+ `8b5d974` code)

| Pass | Per-step exits (lint/typecheck/set-config/preflight/unit/api/mutation/e2e) | Result | e2e wall | Load note |
| :-- | :-- | :-- | :-- | :-- |
| `80passA` (pre-commit tree, identical code) | 0/0/0/0/0/0/0/0 | green, e2e 61 passed | 6.2 m | not sampled |
| `80passB` | 0/0/0/0/0/0/0/0 | green, e2e 61 passed | 6.2 m | kiro-server cluster already resident |
| `80passC` | 0/0/0/0/0/0/0/**1** | **4 failed / 57 passed** | **8.5 m** | 5-min load **6.47–6.88 on 4 cores** — **excluded by the rule below**, written minutes after it excused this run |
| `80passD` | 0/0/0/0/0/0/0/0 | **green, 61 passed** | 5.8 m | `nproc=4`, load **1.88 / 3.99 / 4.85** before, **2.38 / 2.69 / 3.80** after → **counts** |

Pass C's measurements, which show the shape rather than a breach: set-tap **median 21.5 / p95 53.5 /
max 69.9 ms** against a 50 ms gate (passes A and B printed 27.4 and 24.9 ms p95 on the same build), and
`/api/sync` p50 **191.1 ms** — the same spec that printed 208.6 and 232.1 ms in passes A and B, i.e. it
*missed* the documented 200 ms budget more convincingly while the suite was green than while it was red.

Pass D's numbers, on the quieter box, moved in the direction the rule predicts: set-tap **median 14.9 /
p95 18.2 / max 21.1 ms** (against pass C's 21.5 / 53.5 / 69.9 on the same build), and `/api/sync` p50
**171.0 / p95 226.5 ms**, still printing **MISSES** against the 200 ms documented budget — the verdict is
computed on p95, and that is #92's subject, not this card's and not #80's.

### Pass C's four reds

| Spec | Baseline behaviour | First judgement |
| :-- | :-- | :-- |
| `session-runner.spec.ts:111` (100-tap p95 < 50 ms) | green twice at 27.4 / 24.9 ms p95 | **measurement breach under load**, already in the family |
| `sla.spec.ts:144` G-M3-4 (60-mutation drain < 5 s) | red once in #105's pass A with solo median 1 752 ms | **same family member**, load-shaped |
| `session-runner.spec.ts:237` (last session's load as editable default) | not previously recorded | to be established by solo re-run below |
| `dashboard.spec.ts:125` (day started in another tab resolves to the server's answer) | not previously recorded | to be established by solo re-run below; note `#80` cannot reach it — `dashboard.spec.ts` does not import the fixture module |

### Solo re-runs of pass C's four reds — 2026-09-12T14:34Z, `--workers=1`, load 2.46 (1 min) / 5.67 (5 min) on 4 cores

**4 passed (1.1 m)** — every one green, on a box whose 5-minute load was still above its core count from
pass C. That is the discriminating result: none of the four is failing because of a stale fixture row, and
none of them is failing on a code path that #80 touched.

| Spec | Solo | Pass C (red) | Reading |
| :-- | :-- | :-- | :-- |
| `dashboard.spec.ts:125` | **4.0 s** | 13.6 s | see below — this one is not a "flake", it is arithmetic |
| `session-runner.spec.ts:111` | p95 **28.2 ms** | p95 53.5 ms | measurement breach under load, in the family |
| `session-runner.spec.ts:237` | 18.3 s | failed at 9.3 s | failed *earlier than its baseline*, so an assertion gave up well before the flow ran out — a race, not a clock |
| `sla.spec.ts:144` G-M3-4 | 16.1 s | red | drain measurement under load, in the family |

**`dashboard.spec.ts:125` is the same root cause as the phase-label reds, with a number on it.** Its solo
baseline is **4.0 s**, it asserts that a *second, already-open tab* learns about a session created in
another tab (`stale.getByText('In progress').toBeVisible()`, `toHaveCount(0)`), and the app's visible poll
is `POLL_INTERVAL_VISIBLE_MS = 4_000`. So the spec's entire happy path is **one poll cycle long**, and
Playwright's default assertion timeout is **5 s** — 20 % headroom, on a spec whose subject is a poll.
Under a 1.7x-oversubscribed box the poll lands late, the window closes, and a correct product reads as a
failure. That is not contention being mistaken for a bug; it is a window that was never derived from the
propagation design it depends on.
