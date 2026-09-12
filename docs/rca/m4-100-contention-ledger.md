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
| `80passE` | 0/0/0/0/0/0/0/0 | **green, 61 passed** | 6.0 m | load **1.67 / 2.15 / 3.43** before, **6.12 / 5.44 / 4.54** after — arrived mid-run, went green anyway (see the rule's second refinement) |

**#80's merge gate is D + E: two consecutive full-battery greens on code tree `8b5d974`.** Verified rather
than asserted: `git diff --name-only 8b5d974..HEAD` returns only `docs/STATE.md` and this file, so every
commit after the code tip is markdown and cannot move a battery result. Passes A and B were greens on the
same code tree with no denominator recorded; they are history, not the counted pair.

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

**Correction, one row later, against something I wrote from a title: `dashboard.spec.ts:125` is *not*
the poll class.** Reading the spec's body (`:136-158`) shows the mechanism is a **rejection-triggered
refetch** — the stale tab clicks Start, the server refuses it under `one_active_session_per_day`, and the
client's own comment says "after the rejected attempt **and the refetch it triggers**, the stale tab shows
the one true session". No `POLL_INTERVAL_VISIBLE_MS` is on that path, so the paragraph this row replaced
("its entire happy path is one poll cycle long") was an inference from the test's *name* and is withdrawn.
Its solo baseline of 4.0 s stands; its cause does not.

**So this one stays open, and the reason it can stay open honestly is that it is now observable.** Pass C's
error text is unrecoverable — `battery.sh` greps `passed|failed|✘`, which is how #105 lost its own
assertion diffs and how I nearly reconstructed this from memory. Traces and per-spec durations now exist,
so a future red arrives as `trace.zip` plus a JSON entry instead of an argument. What is *not* done here:
no speculative window widening on a mechanism nobody has named, because a fence for the wrong cause
converts a red that means something into a green that means nothing.

## Instrumentation landed — #100 branch `test/m4-100-contention-fences` (stacked on `#80`'s `8b5d974`)

`playwright.config.ts` now keeps a failure's evidence, and `tests/unit/infra/e2e-evidence-config.test.ts`
pins the configuration so it cannot revert to an unobservable intention.

**The claim, watched rather than asserted.** A temporary failing spec ran on this box:

| Spec | status | duration | trace produced |
| :-- | :-- | :-- | :-- |
| `deliberate failure for the trace check` | `failed` | **1 558 ms** | `test-results/…/trace.zip` ✓ |
| `deliberate pass carrying a known sleep` | `passed` | **3 440 ms** | none (correct: only failures retain) |

The throwaway spec was deleted in the same change. The durations arriving in `test-results/playwright.json`
is the part that changes how this file gets written from now on: a near-miss (tap p95 47 ms, G-M3-4's drain
at 4.6 s) is now visible across runs instead of being remembered from a console line.

**Two provocations, each red on exactly one named test:**

| Breakage | Result |
| :-- | :-- |
| `retain-on-failure` → `on-first-retry` (the dead setting) | `records a trace on failure rather than on a retry that never happens` — **red** |
| `retries: 2` added to the config | `keeps retries off, so a red gate still means red` — **red** |
| restored | 4/4 green |

**What the guard caught on its first run was a defect in the guard, not in the config.** It asserted
`not.toContain('on-first-retry')` against the raw file — and tripped on the block comment that *explains*
why that setting was dead. A prose-sensitive guard is worse than none: it fails on documentation and passes
on a real regression hidden in a comment. Fixed by scanning code with block comments stripped (and line
comments stripped only when `//` is not preceded by `:`, so `"http://localhost:3001"` survives). The same
file asserts its scan found >10 spec files including `sla.spec.ts` and `a11y.spec.ts`, which is the
`finds the specs it claims to have scanned` lesson from #105 applied before it had to be learned twice.

**Retries stay off, and that is the considered choice, not an oversight:** they would make the original
`on-first-retry` setting work as intended *and* silently convert every flake into a green after one
attempt. The card's whole premise is that red has to keep meaning red.

## #119's CI run is the experiment #80 was for

CI runs `npm run test:e2e` **bare** — no `--workers` cap — so on its 4-core runner the suite executes at
Playwright's default worker count. PR #119's `test` job came back **green in 13m7s** with per-run fixture
ids in place. That is not proof the contention family is gone (CI's runner is faster and quieter than this
box, and it is a single sample), but it is the first green at *uncapped* workers this project has had on a
branch whose subject is shared identity — and it is the configuration #100 must now reproduce locally
rather than theorise about.

## The label fence landed — and it immediately made a new mistake, which is the useful part

`tests/e2e/runner-fixtures.ts` gained `PHASE_LABEL_WINDOW_MS = 2 × POLL_INTERVAL_VISIBLE_MS + 2_000`
(= 10 s, **imported** from `src/app/state/sync-engine.ts`, not retyped), plus `expectPhase`. Eleven call
sites across three files converted from bare `toContainText('<label>')`, which had been running on
Playwright's 5 000 ms default — half the poll interval they depend on.

**Guard:** `tests/unit/infra/e2e-phase-window.test.ts`, 4 specs. Provoked red three times, each on exactly
one named test — window detached to `1_000`; one site rewritten to a bare `toContainText('Resting')`;
`'Stretching'` deleted from the union while the app still renders it. Restored to 4/4 before commit.

**Two defects the guard found in itself, not in the code:**
- its label parser looked for a *quoted* key (`pre_workout:` is unquoted), so `appPhaseLabels()` returned
  `[]` and the comparison "passed" against an empty list. Now it throws when it parses nothing. A scanner
  that silently finds no subjects reports success while testing nothing — the same failure #105's fixture
  guard was written against.
- it flagged `a11y.spec.ts:243`, which asserts the subtitle carries *one of* the phase words. That is the
  "colour is not the only carrier" rule, not a transition wait; routing it through `expectPhase` would
  have made a test assert a single label it has no business choosing. The scan now matches string-literal
  arguments only, and says so inline.

**And the change created the next problem measurably.** `a11y.spec.ts:102` went green solo in **24.4 s**
after the fence — up from the 15.1 s baseline audit 17 recorded, because four 10 s windows are now legal
waiting inside one test, against a **30 s default test timeout**. Enlarging assertion windows without
enlarging the clock simply moves the failure from "measurement breach" to "test timeout" — which is
precisely audit 19's shape for G-M3-3, and precisely what the card says a measurement's own arithmetic
justifies fixing. It now carries `test.setTimeout(WORKOUT_FLOW_TIMEOUT_MS)`, the constant the other two
whole-workout flow specs already use and that this one had somehow never been given, with the arithmetic
(4 × 10 s + flow, 24.4 s measured) in the comment. Full file: 7 passed in 49.4 s.

Unit layer after this increment: **44 files / 427 tests** (was 42 / 419 — the two new guards). ESLint
exit 0, typecheck 0 errors.

### Still open in this class
- `dashboard.spec.ts:125` (4.0 s baseline, 5 s windows, poll-dependent): same class, different subject —
  it asserts list state, not a phase label, so `expectPhase` does not fit. Needs a derived window of its
  own or a structural wait, decided by experiment.
- The `waitForQueued` (registration-then-ack) idea is **not implemented**: it assumes the "N waiting to
  sync" render is observable long enough to catch, and if a fast ack skips it the helper becomes a new
  flake generator. The derived window carries the fence alone until that is measured.

## The clocks, measured — and audit 19 stops being a mystery

`sla.spec.ts`'s three measurement specs ran on Playwright's **30 s default test timeout** with no override,
while two of them *declare* more permitted waiting than that. Both are now set from their own constants:

| Spec | Declared waits | Measured solo, quiet box (load 1.08 / 2.33) | Old clock | New clock |
| :-- | :-- | :-- | :-- | :-- |
| **G-M3-3** `:315` | 15 000 + 5 × 8 000 = **55 s** | **25.7 s — 86 % of its old budget** | 30 s | 55 s + `WORKOUT_FLOW_TIMEOUT_MS` = 145 s |
| G-M3-4 `:169` | 10 000 + 15 000 = 25 s | 8.3 s (16.1 s in an earlier solo) | 30 s | 115 s |
| G-M3-2 `:94` | **none declared** | 5.8 s | 30 s | **30 s, left alone** |

G-M3-3's number is the one that retires the story. Audit 19 recorded it "running out its 30 s *test* budget
while printing a **passing** measurement", and that is exactly what a 25.7 s quiet-box baseline inside a
30 s clock predicts: **4.3 s of headroom** on a spec whose own assertion windows permit 55 s of waiting. No
contention required, no product defect required — the arithmetic never fit. The json reporter is what turned
that from a reading of the code into a measurement: `list` printed 25.7 s once and would have forgotten it.

G-M3-2 keeps the default deliberately. It declares no waits and its recorded failure was a measurement
breach at p95, so extending its clock would be loosening a gate to fit a narrative about it.

**Why there is no separate guard for these clocks:** the inline literals and the test timeouts are now the
same identifiers — `G_M3_3_BADGE_WINDOW_MS`, `G_M3_3_PROPAGATION_WINDOW_MS`, `G_M3_4_QUEUE_VISIBLE_MS` — so
a clock cannot drift below the waits it contains without editing them, and `grep -n "timeout: [0-9]"` over
this file returns nothing. Naming the values *is* the fence; a test asserting a sum of two names would
decorate it.

## `100run1` — a harness event, recorded because discarding it silently would be the same error as retrying a flake

**54 failed / 6 passed in 2.9 m.** One cause, and the log proves it by its shape rather than by my
reading of it:

| # | Test | Result |
| :-- | :-- | :-- |
| 1–4 | `a11y.spec.ts` axe on `/`, `/sign-in` | passed in ~1 s — the server was alive |
| 5 | `a11y.spec.ts:103` (keyboard walker) | failed at 13.7 s: expected `Working out`, received `· Warming up`, **Timeout 10 000 ms, 24 polls** at `runner-fixtures.ts:216` |
| 6–60 | everything after | failed in **623–971 ms each**: `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3001/` |

More than half a suite failing inside one second is not fifty-four findings; it is the target server
disappearing, and every remaining spec then reporting the same absence. Test 5's label red is a symptom of
the same event — its task mutation had no server to acknowledge it, so the phase legitimately never
advanced, and `expectPhase` waited its full derived 10 s instead of deciding at 5 s.

Evidence gathered, including the three negative results that matter: **no crash output** in the run's
`[WebServer]` stream after its startup warnings (a Next process that throws says so; this one went silent,
i.e. a signal), **no OOM in `dmesg` or the kernel journal**, and **no competing battery or stray
`next-server` process** found afterwards. `pkill -f '[n]ext-server'` appears in my harness at the *start*
and *end* of the e2e step, which is the right place for it but would be fatal if a second harness ever ran
concurrently — the one hypothesis that fits a signal with no output, and not available for this pass
because nothing else was running.

**Reproduction, same tree, same command, nothing else on the box: `61 passed (5.3m)`, zero refusals, load
1.78.** The verdict therefore is: `100run1` measured the harness, does not count toward #100's five, and
its cause is **unnamed**. Unnamed is not the same as resolved, and #100 does not get to close while "the
server can vanish mid-suite and the log blames the specs" is unaddressed.

What the pass did buy: **the first `trace.zip` this project has ever produced from a battery failure**
(`test-results/a11y-a-whole-session-can-b-f0515-…/trace.zip`), which is the instrumentation claim working
on a real incident rather than on a provoked one. And `battery.sh` now counts `ERR_CONNECTION_REFUSED`
occurrences and prints `HARNESS: that pass measured the harness, not the specs. Do not count it either
way.` — so the misreading cannot be made again by whoever runs it next, including me.

## The suite's wall clock, finally measurable — and the denominator I got wrong in my own table

The green repro produced per-spec durations for all 61 specs. Slowest four, against the clock each one
*actually* runs under:

| Spec | Duration | Its real clock | Utilisation |
| :-- | :-- | :-- | :-- |
| `sla.spec.ts:315` G-M3-3 | 25.6 s | 145 s (set this round, from its 55 s of declared waits) | 18 % |
| `timers.spec.ts:307` | 23.6 s | 90 s (`WORKOUT_FLOW_TIMEOUT_MS`, already present at `:308`) | 26 % |
| `session-runner.spec.ts:202` | 18.3 s | 90 s | 20 % |
| `lighthouse.spec.ts:276` | 13.5 s | **30 s default** → now 240 s | **45 % → 6 %** |

My first pass at this table computed "utilisation" as a share of a **30 s default for every spec**, which
was wrong for the six that set their own clocks and would have made G-M3-3 look like an 85 % near-miss when
it had already been given 145 s. Corrected above. The lesson is the ledger's own, applied to me: a
measurement without the right denominator is worse than no measurement, because it looks like evidence.

**The one real finding in that column is a class #100 had not named: a `describe`-scoped clock does not
reach tests declared outside the `describe`.** `lighthouse.spec.ts:99` set 240 s inside
`test.describe('Lighthouse accessibility')`, while the two whole-page audits at the bottom of the same file
are top-level `test(...)` calls — so they ran a cold Chrome plus a full audit inside the **30 s default**,
taking 12.2 s and 13.5 s on an idle box. Under the same contention that produced pass C, those are reds
with no product meaning at all. The ceiling is now `LIGHTHOUSE_RUN_TIMEOUT_MS`, named once and applied to
all four specs; verified 4/4 green in 1.1 m. This is *scoping*, not arithmetic — the G-M3-3 bug was a sum
that exceeded its clock, and this one was a clock that never applied.

## #100's counted sequence — five consecutive full batteries, zero solo re-runs

Criterion, from the card: five consecutive full-battery greens on this machine with **no spec re-run in
isolation to rescue it**, each pass reporting its denominator. Code tip: `89f0281`, rebased onto merged
`main` (`dac6b44`, which contains #80). Per-step exits are lint / typecheck / check-set-config /
api:preflight / unit / api / mutation / e2e.

| Pass | Per-step exits | e2e result | unit / api | set-tap p95 | `/api/sync` p50 | `nproc` · load before → after | Counts? |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `100q1` | 0 ×8 | **61 passed (5.9 m)** | 44/427 · 11/64 | **33.1 ms** vs 50 | 251.1 ms vs 200 (MISSES, #92) | 4 cores · **3.79 / 4.37 / 3.87 → 3.15 / 4.23 / 4.04** | **1/5** |
| `100q2` | 0 ×8 | **61 passed (5.7 m)** | 44/427 · 11/64 | **30.6 ms** vs 50 (max tap 56.3 — the gate is p95) | 226.2 ms vs 200 (MISSES, #92) | 4 cores · 2.17 / 3.82 / 3.91 → 2.55 / 4.11 / 4.07 | **2/5** |

| `100q3` | 0 ×7, **e2e exit 1** | **1 failed / 60 passed (6.7 m)** | 44/427 · 11/64 | (not reported, see note) | — | 4 cores · 3.19 / 3.71 / 3.86 before → **4.59 / 6.85 / 5.96 after** | **streak reset — see below** |

### `100q3`'s red is a member of the family with a name, and it is not a timing window

```
✘  tests/e2e/a11y.spec.ts:163:1 › state is carried by glyph and word, not by colour (8.1s)
   Error: Could not clean up M1-16 test user (500).
     at ../integration/api/fixtures.ts:156
```

**Zero `ERR_CONNECTION_REFUSED`**, so this is not `100run1`'s vanished-server signature. And it is not a
slow assertion either: nothing about the app was asserted wrongly — **`cleanup` threw**, in the teardown
path of `createTestSession`, because GoTrue's `DELETE /auth/v1/admin/users/{id}` returned **500**.

That retires a loose end that had been carried on two PRs' "not claimed" lists. The same string appeared on
`session-runner.spec.ts:111` in earlier passes, where it was filed as unexplained. **It is one event, not
two flakes** — whichever spec happens to own the fixture at the moment GoTrue 500s is the spec that gets
blamed, which is exactly why this family looked random and why solo re-runs "fixed" it: the 500 is
episodic, not per-spec. A red that lands on an arbitrary file name is a red about shared infrastructure
wearing a spec's clothes.

**The load number does not excuse it, and the streak therefore resets.** The ledger's load rule disqualifies
*windows* a busy box can stretch; an HTTP 500 from the identity service is not a window, and q3's load
(3.19 before, 4.59 → 6.85 after on 4 cores) is at most a candidate reason *why* GoTrue 500'd — a cause, not
a dispensation. `100q1` and `100q2` stop counting toward the five. Restating that cost rather than quietly
restarting the numbering is the point: after the fix the sequence must be **five fresh consecutive greens**,
not three more.

Also recorded without attribution, because it is the only other server-side line in the pass and I am not
ready to connect them: `[WebServer] ⨯ Error: The destination stream closed early.` (digest `385829324`,
`100q3-e2e-full.txt:88`).

**Why the 500 cannot yet be named, and what that costs:** `fixtures.ts:156` reports the status and nothing
else, and the delete response body is never read; the create path at `:136` parses a body and then throws it
away, keeping only the status. So the identity service's explanation for its own failure is discarded by our
test helper — this was raised as an unfiled artifact twice and never ruled on, and it has now become
load-bearing: #100 cannot exit "as a root cause with a control" while the root cause's own message is being
thrown out. Surfacing it is the next change, and it is a diagnostic, not a gate: no threshold, no assertion,
and no expectation about GoTrue changes.

`100q2` ran at `HEAD=cf2372a`, one markdown commit above the code tip: `git diff --name-only 89f0281..HEAD`
returns this file alone, so the counted pair shares code tree `89f0281` — the same discipline #80's gate used,
and for the same reason: a ledger row must not invalidate the pass it is recording.

**Zero solo re-runs across both passes.** Nothing was re-run in isolation, because nothing went red; the
protocol §7 still recommends ("re-run a red timing gate solo before believing it") stayed unused, which is
the first time in this project's history that the recommendation has been *satisfiable* rather than merely
followed.

## The streak restarts at `7baf430` — the cost of treating a red as real

`100q1` and `100q2` are history, not the first two of five. **Fresh sequence, code tip `7baf430`:**

| Pass | Per-step exits | e2e | unit / api | set-tap p95 | `/api/sync` p50 | load before → after | Streak |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| `100r1` | 0 ×8 | **61 passed (5.6 m)** | 45/430 · 11/64 | **18.2 ms** vs 50 | 244.2 vs 200 (MISSES, #92) | 4 cores · **3.42 / 3.78 / 4.68 → 4.96 / 4.32 / 4.61** | **1/5** |

`100r1` is the first *counted* green earned with the 1-minute load **above the core count for most of the
pass** (4.68 before, 4.96 after, on `nproc=4`), and the set-tap gate measured **18.2 ms p95** — its best
number of any pass in this ledger, including the quiet ones. Two things follow, and only the second one is
comfortable: the label/clock fences hold under oversubscription, and a "quiet box" was never the condition
that made earlier passes pass, because they had no denominator to be quiet about.
| `100r2` | 0 ×8 | **61 passed (7.4 m)** | 45/430 · 11/64 | **34.8 ms** vs 50 (max tap 52.6) | 215.1 vs 200 (MISSES, #92) | LOAD BEFORE: 3.91 4.07 4.49 →  5.82 8.49 6.74 | **2/5** |

**`100r2` is the pass that tests what #100's fences were built for.** An unrelated `opencode` session held
~50 % of a core for 45 minutes and a `VBCSCompiler` joined it mid-run; the 1-minute load peaked at **8.49**
on `nproc=4` — **2.1× oversubscribed** — and the suite went green anyway, in 7.4 m against 5.6 m for the
quieter `100r1`. Set-tap measured p95 34.8 ms with a single tap at 52.6 ms: the p95 gate held, and the
individual max is reported here rather than being the thing that gates, which is how the spec is written.

That is not "the box was quiet so it passed" and it is not "we loosened something": every window that had
previously been shorter than the propagation it waited on was widened to its derived bound *before* this
pass, and no SLA moved. The honest reading is narrower than "flakes fixed" — it is **one pass at 2× load
with zero reds**, which is more than any earlier branch can show *measured*.
| `100r3` | 0 ×8 | **61 passed (5.3 m)** | 45/430 · 11/64 | **18.7 ms** vs 50 | **175.2 ms — inside 200** | 3.53 / **7.04** / 6.39 → 2.68 / 4.19 / 5.29 | **3/5** |

`100r3` ran with the 5-minute average at **7.04** (1.8× cores) when it started and came down as it went, and
`POST /api/sync` printed **p50 175.2 ms — inside the documented 200 ms** for the first time in this ledger.
Worth stating precisely because it cuts both ways: the budget's verdict on this box swings with what the
neighbours are doing, which is #92's point about the measurement needing a quieter denominator, not evidence
that anything in the app improved. The 800 ms enforced ceiling is untouched and was never approached.
