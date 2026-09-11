# M3 verification audit — every gate observed to fail

**Task:** M3-10 (#67), implementation task 2. **Date:** 2026-09-11. **Branch:** `feat/m3-10-verification-gate`.

The standing protocol is that a control which was never seen to fire is not a disarmed control — a
green gate nobody has watched go red is a decoration. Each entry below is a violation **injected on
purpose** or a failure **observed while writing the gate**, with the real captured output. Nothing
here was reconstructed after the fact.

---

## 1. Design-token contrast gate — leaf token broken (injected) → RED

`src/app/globals.css`: `--on-surface-variant: #475467` → `oklch(0.95 0.01 250)`.

```
 FAIL  tests/unit/design/contrast.test.ts [ tests/unit/design/contrast.test.ts ]
      Tests  no tests
```

Fires, and worth recording honestly: it fires as a **collection error, not an assertion failure**,
because the gate parses literal hex out of the stylesheet at import time and cannot parse the injected
form. The suite goes red either way, but the message tells a reader nothing about *why*.

## 2. Same gate, alias broken (injected) → **GREEN — a hole, not a pass**

`--muted-foreground: var(--on-surface-variant)` → `oklch(0.93 0.01 250)` (near-white body text). The
unit gate stayed green: it resolves leaf tokens and does **not follow one level of `var()`
indirection**, which is exactly how the token layer is built — most text colours are aliases.

The rendered layer was then tested:

- axe on `/` — **still green**, because that route renders no `muted-foreground` text.
- axe on `/settings` (dense with it) — **RED**: `color-contrast` violations reported (`axe 4.13`).

**Finding: the two layers do hold each other up, but neither covers "an alias is re-pointed and no
tested route renders it."** That is a real gap, not a hypothetical one — the violation sat in a
stylesheet for two full test runs unnoticed. Cheapest close: have `contrast.test.ts` resolve one
level of `var()` rather than reading only literals. **Left unfixed here** because changing a gate to
cover a hole discovered by breaking it is a separate, reviewable change — this audit records the hole.

## 3. Legacy-parity scan (injected by my own bug) → RED

The first version of `legacy-parity.spec.ts` hardcoded legacy filenames and omitted
`ppl-workout-dashboard`, so the "the old app still owns its keys" check lost sight of `userStats`:

```
Error: userStats is no longer referenced by any legacy module
```

This is the gate working on its author, and the reason the check exists at all: proving the new app
writes nothing is worthless if the old app was quietly made to stop writing. Fixed by enumerating each
module's tracked files through `git ls-files` rather than guessing names — a hardcoded list silently
scans nothing in the directory it forgot, and "scans nothing" reads as "the key is gone."

## 4. G-M3-4 drain ceiling (incidental, production build) → RED

**Superseded by entry 16, kept as written.** The bimodal 4.7–9.7 s distribution recorded here
was later traced to a real defect (the offline-grown backoff window surviving reconnect) and
fixed; post-fix, the same budget measures 1.7–1.8 s and *passes*. What stays true as written: the
ceiling caught a tail, the budget never moved, and every number below was really measured — on
the buggy client.

Asserted at 8 s with a 5 s budget. Breached on the first cold run:

```
[G-M3-4] MISSES the G-M3-4 5000ms budget by 4086ms — online→empty=9086ms node→empty=9357ms
         superseded=0 /api/sync POSTs=1 [200] (one batch: MAX_BATCH=200)
```

Ceiling widened to 15 s **as a hang guard only**; the 5 s budget is unchanged and the MISS is printed
every run. Six measured samples: 4693 / 5051 / 5084 / 5326 / 5334 / 9660 ms.

## 5. G-M3-4 confound removed (incidental) → RED, then redesign

Tapping one set 60× offline produced `14 refused by the server` with lines
`Set 1 — STALE_CONFLICT. Reload to see the server's state.` — correct per-target optimistic
concurrency, not a slow drain, and the badge conflates "queue empty via applied" with "empty via
discarded". Round-robining 17 distinct sets gives a clean 60 with 0 superseded.

## 6. Keyboard-only gate (incidental, two real bugs in my own harness) → RED

```
Expected substring: "Working out"           ← task rows are <label>s: not focusable, and Enter
                                               does nothing to a checkbox. Space, on the inner input.
Expected: "completed"  Received: "in_progress"  ← waitForSynced passed because the badge already read
                                               "All changes synced" before session.finish left the client.
```

Both were assertion bugs, not product bugs, and the second is the general trap: **never treat
`waitForSynced` as proof a mutation landed.** The finish is now asserted against the server status.

## 7. Colour-alone gate: first draft was wrong, not the app → RED

Captured `before`/`after` as four separate awaited reads across an optimistic update, producing a
DOM state that cannot exist (`aria-pressed` moved, its word did not). Fixed by snapshotting inside one
`evaluate`. Measured fact retained: **`hueCarriesState=false`** — completion carries no colour signal
at all, so my "all four channels must move" assertion was a *stronger* claim than G-M3-6 makes.

## 8. Sign-out (from #66, recorded here as a fired control) → RED

`SignoutRequestSchema` is `z.object({}).strict()`; a bodyless POST is a 400, so the button sat inert
with the session alive — the dangerous direction for a CSRF guard to fail. Green since `91838e7`.

---

## Still to fire → resolved below

The five controls that had not yet been watched to fail at the time of the first pass
(G-M3-2 tap-latency injection, the mouse guard, the Lighthouse 100 assertion, the queue-empty
guard, and the colour-alone gate) are **all fired now** — entries 9 to 13, each with the captured
output. Entry 14 closes the alias hole entry 2 recorded as a finding. Entry 15 is a defect the
hang ceiling caught without any help from me. Entry 16 is the one command sequence that
reproduces the whole exit report (Scenario 1).

---

## 9. G-M3-2 tap-latency budget (injected) → RED

`src/app/session/[id]/runner.tsx`, inside the `tap` handler, before the optimistic commit: a
90 ms synchronous busy-wait (`while (Date.now() < stallUntil)`). Then
`npx playwright test sla.spec.ts -g "G-M3-2"` against the rebuilt production bundle:

```
[G-M3-2 tap→UI] n=17 median=98.0ms p95=104.0ms max=104.0ms
  ✘  tests/e2e/sla.spec.ts:69:3 › … › G-M3-2 — set-tap to local UI update is under 50 ms with no network in the path (6.9s)
    Error: p95 104.0ms exceeds the 50ms goal
  1 failed
```

The injected 90 ms is visible inside the measured 98–104 ms rather than merely asserted: the
stall lands between the captured `pointerdown` and the committed `aria-pressed`, which is exactly
what the budget is for. Restored and re-run on the same command:
`n=17 median=14.2ms p95=17.9ms max=17.9ms → 1 passed`.

## 10. The mouse guard (injected) → RED

One stray pointer into the keyboard-only flow: `await page.mouse.click(10, 10);` as the first line
of `completeWorkoutByKeyboard` (`tests/e2e/runner-fixtures.ts`), then
`npx playwright test a11y.spec.ts -g "keyboard alone"`:

```
  ✘  tests/e2e/a11y.spec.ts:102:1 › a whole session can be completed with the keyboard alone (2.9s)
    Error: keyboard-only: page.mouse.click() is not available. Activate controls with focus() + press('Enter').
  1 failed
```

It fails at the call site within ~3 s — the guard does not let a "keyboard-only" test quietly
become a mouse test. The Node-side monkey-patch is the half that throws; the page-side
pointer counter (`pointerEventCount`) is the half that catches synthetic events, and the two
together are why this flow stayed honest while being written.

## 11. The Lighthouse 100 assertion (injected) → RED — and one near-miss worth recording

Route chosen: `/history`, the first spec that asserts `score === 100` outright. The **first**
injection — replacing the "Today" link's text with a zero-width space (`{'\u200b'}`) — measured
`100` and **passed**. Lighthouse counts a zero-width space as a name; so does the accessibility
tree. An accessible name that renders as nothing is a violation only in the eye of the user, and
this gate, as designed, did not catch it. Recorded honestly as a limit of the injection, not of
the app (no shipped element does this).

The second injection removed the name entirely (`<Link href="" />` — genuinely empty):

```
[measurement] lighthouse accessibility score for /history: 95
  ✘  tests/e2e/lighthouse.spec.ts:186:3 › Lighthouse accessibility › scores 100 on the authenticated history screen (12.8s)
    Error: audits below 0.9: link-name
    > 221 |       expect(score, `audits below 0.9: …`).toBe(100);
  1 failed
```

The failing-audit naming in the message worked as intended: `link-name`, unprompted. Restored and
re-run: `score for /history: 100 → 1 passed`.

## 12. The queue-empty / drain guard (injected) → RED

`src/app/state/sync-engine.ts`, at the top of `drain()`: refuse when the queue is deep
(`if ((await this.outbox.pendingCount()) >= 60) return null;`). Small queues still drain, so the
warm-up and the 60 offline taps all behave; only the reconnect-time drain of the burst vanishes —
the exact pathology the ceiling exists for. `npx playwright test sla.spec.ts -g "G-M3-4"`:

```
  ✘  tests/e2e/sla.spec.ts:144:3 › … › G-M3-4 — a 60-mutation queue drains in under 5 s after reconnect (22.3s)
    Error: expect(locator).not.toContainText(expected) failed
    Expected substring: not "waiting to sync"
    Received string:    "60 waiting to sync"
           - waiting for getByTestId('queue-badge')
             34 × locator resolved to <div data-testid="queue-badge" …>60 waiting to sync</div>
                - unexpected value "60 waiting to sync"
  1 failed
```

The `sla.spec.ts:225` assertion (the 15 s hang ceiling) is the guard that fires; the
`expect(badge, 'queue never emptied')` at line 256 is never reached, and this run does not claim
otherwise. Restored; the green re-run of this test is in the full battery (entry 16). (At the time
of writing this entry the restored build was believed to print its `MISSES …` line — entry 16 then
happened, and what the restored build actually prints post-fix is recorded there.)

## 13. G-M3-6, the colour-alone gate: the injection first went THROUGH the gate → then the gate was fixed, injected again → RED

The violation: delete the word carrier from the tick button
(`{isCompleted ? 'Logged' : 'Not logged'}` removed, `✓`/`○` glyph kept). That is the real
G-M3-6 regression *here* because the measured fact from entry 7 stands — `hueCarriesState=false`
— so with the words gone, the only visible non-attribute difference left is a glyph.

**Run against the gate as written: the gate passed it.** `a11y.spec.ts:146 › state is carried by
glyph and word, not by colour` — ✓ green. Its text assertion is differential
(`after.text !== before.text`), and a `○ → ✓` glyph swap satisfies a delta; nothing required the
`word` half of the test's own name. What *did* bite, in the same run, was the runner spec's
word-carrier assertion:

```
  ✓  tests/e2e/a11y.spec.ts:146:1 › state is carried by glyph and word, not by colour (5.2s)   ← THE HOLE
  ✘  tests/e2e/session-runner.spec.ts:28:3 › session runner › keeps an offline tick … (10.1s)
    Error: expect(locator).toContainText(expected) failed
    Expected substring: "Logged"
    Received string:    "✓"
  1 failed, 1 passed
```

`TICK_STATE>>> {"before":{"text":"○",…},"after":{"text":"✓",…}}` — the captured snapshot, glyph-only
both states.

The fix (commit `4ca87e5`, permanent): measure the word **apart from the glyph** and require each
state to name itself — `wordOf(before)` must match `/not logged/i`, `wordOf(after)` must match
`/logged/i`. Same injected build, same command:

```
  ✘  tests/e2e/a11y.spec.ts:146:1 › state is carried by glyph and word, not by colour (4.1s)
    Error: the un-logged state has no word carrier
    Expected pattern: /not logged/i
    Received string:  ""
  1 failed
```

Restored (`git checkout -- src/app/session/[id]/runner.tsx`); re-run green, with
`text:"○Not logged" → "✓Logged"`. The injection is not kept anywhere; the tightening is.
A differential check on text is not a word carrier, and this entry is the standing proof.

## 14. The contrast alias hole (entry 2) — FIXED, then injected, then observed RED

Entry 2's finding — the unit gate read leaf hexes and could not see a re-pointed alias — is
closed in commit `96b5202`: `parseRootTokens` now follows `var()` chains to their leaf, the matrix
measures the alias names the primitives actually consume by name (`--muted-foreground`,
`--foreground`, `--card-foreground`, `--primary-foreground`, `--secondary-foreground`,
`--destructive-foreground`, `--destructive` — 35 measured pairs, all passing on the shipped
palette), and an unparseable value is reported as a FAIL with a reason instead of crashing the
spec file at import time (which fixes the message-quality complaint of entry 1 too).

Live injection, the same shape as entry 2: `--muted-foreground: var(--outline)` in
`src/app/globals.css`, then `npx vitest run tests/unit/design/`:

```
 FAIL  tests/unit/design/contrast.test.ts > shipped palette passes the gate > measures every matrix row against both card and page surfaces (35 pairs)
AssertionError:   FAIL  muted text (alias)  --muted-foreground on --card: 1.47:1 (min 4.5:1)
  FAIL  muted text (alias)  --muted-foreground on --background: 1.41:1 (min 4.5:1)
  ✗ muted text (alias): --muted-foreground vs --card measures 1.47:1, needs 4.5:1
  ✗ muted text (alias): --muted-foreground vs --background measures 1.41:1, needs 4.5:1
```

The oklch form of entry 2 is now *measured and named* rather than crashing: `parseRootTokens`
returns it verbatim, `runGate` emits `muted text (alias) [unmeasurable: oklch(0.93 0.01 250)]` as
a FAIL row — that behaviour is kept as a permanent assertion, as is the `var(--outline)` re-point
(both live in `the gate can fail` in `tests/unit/design/contrast.test.ts`). Restored;
`14 passed`. Residual limit, named: the gate measures the **enumerated** tokens — a *new* alias
token nobody added to the matrix is still invisible to it, and the matrix comment records which
aliases are deliberately absent because nothing renders them today. The axe/Lighthouse layers are
what watch the rendered end.

## 15. The hang ceiling caught a real defect, not a flake (incidental, production build) → RED → FIXED → GREEN

**This one was not injected.** Battery run 1 of the full M3 sequence (nothing modified, clean
tree, `npx playwright test --reporter=list` against the restored build):

```
  ✘  53 tests/e2e/sla.spec.ts:144:3 › … › G-M3-4 — a 60-mutation queue drains in under 5 s after reconnect (22.1s)
    Error: expect(locator).not.toContainText(expected) failed
    Expected substring: not "waiting to sync"
    Received string:    "60 waiting to sync"
    Timeout: 15000ms
    Call log:
      - waiting for getByTestId('queue-badge')
        34 × locator resolved to <div data-testid="queue-badge" …>60 waiting to sync</div>
           - unexpected value "60 waiting to sync"
  1 failed, 60 passed (3.2m)
```

The badge did not drain *slowly* — it did not drain at all: 34 polls, same string, 15 s. That is
not jitter; jitter moves a number, this moved nothing. `pk:debug` before patching, and the
mechanism is arithmetic rather than mystery: the 60 offline taps each fail their send while the
context is offline, full-jitter backoff (`base 1 s, cap 30 s`) grows `nextSendAt` per attempt, and
**nothing clears it when the browser reports `online`**. The provider's `onOnline` drain — whose
comment claimed "draining then is free" — returns null inside its own window, and every 4 s poll
is gated by the same window. The queue sits at 60 for however long the last window happens to be:
under a second when the window drew short (the 4.7–9.7 s entries 4/7 recorded as a MISS, which
was really this wait most of the time), 15+ s when it drew long, which is what the suite-load run
hit. The bimodality the old STATE note called "cold-start variance" was a bug wearing a distribution.

Fix (commit `6b2017e`, product code): `SyncEngine.notifyConnectivityRestored()` clears
`nextSendAt`; `provider.tsx`'s `online` listener calls it before draining. Attempt counts
untouched — a browser that lied about coming online regrows a *larger* window next failure, and
the 120/min limiter bounds the noise either way. Permanent unit control in
`tests/unit/state/sync-engine.test.ts` (`an online event clears the window grown while the network
was off`) asserts both halves: an ordinary drain inside a window is still a no-op, a post-`online`
drain sends.

Measured after the fix, restored build, same 5 s budget, standalone:

```
[G-M3-4] PASSES the G-M3-4 5000ms budget — online→empty=1783ms node→empty=1814ms superseded=0 /api/sync POSTs=1 [200] …
[G-M3-4] PASSES the G-M3-4 5000ms budget — online→empty=1838ms node→empty=2315ms superseded=0 /api/sync POSTs=1 [200] …
[G-M3-4] PASSES the G-M3-4 5000ms budget — online→empty=1711ms node→empty=1828ms superseded=11 /api/sync POSTs=1 [200] …
  3/3 passed (9.5–10.3s)
```

**Two things this changes about earlier entries, and both are stated here rather than edited
away.** (1) Entry 4's and §"numbers"' G-M3-4 MISSes are superseded: they measured the client
waiting out its own stale window; post-fix the same measurement is 1.7–1.8 s and the line prints
PASSES — the budget never moved (5 s, as written), and the honest reporting of the miss at the
time is what made this findable. (2) The G-M3-4 *gate* still gets its break credit from entry 12:
the injected `drain()` refusal fired the same guard, proving the assertion bites whether the
swallow is injected or structural. The 15 s hang ceiling earned its keep in its first full-suite
week — that is the break-each-gate argument in its purest form: the ceiling's job is not to pass,
it is to turn "sometimes slow" into "never drains," which is a different bug, and it did exactly
that, unasked, during a battery run meant to confirm green.

## 16. Reproducibility: the one command sequence (Scenario 1)

From a clean checkout of this branch with the local Supabase stack up (`npm run db:up`) and a real
`.env.local` (preflight will tell you if it is wrong). Everything else — Chrome libs, Playwright
browsers — is per `PROMPTKIT.md` §3. Run from the repo root:

```bash
# Preamble the browser suites need on this machine (see STATE §5; CI does it with --with-deps):
set -a && . ./.env.local && set +a
export LD_LIBRARY_PATH=/tmp/pwlibs/ext/usr/lib/x86_64-linux-gnu   # skip on CI
fuser -k 3001/tcp 2>/dev/null                                     # the suite boots its OWN prod build

# 1. Gates: exit 0 each, and the printed totals below are the exit-report numbers.
npm run test:api:preflight && npm run lint && npm run typecheck
npm test                                  # 23 files / 257 tests (incl. the permanent negative controls)
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run \
  tests/integration/api tests/integration/security   # 10 files / 60 tests
npx tsx scripts/check-contrast.ts          # 35/35 measured pairs pass; exit 0
npm run test:mutation                      # exit 0 (needs .env.local sourced above)

# 2. The E2E battery + the Lighthouse scores, one production build, ~3.5 m:
npm run next:build && npx playwright test --reporter=list   # 62 passed / 0 failed
```

Step 2's stdout carries every measurement the exit report quotes — none of it has to be believed
from a table: `[G-M3-2 tap→UI] n=17 median=… p95=…`, `[G-M3-3 cross-device] n=5 …`,
`[G-M3-4] PASSES the G-M3-4 5000ms budget — online→empty=… POSTs=1` (post-fix; it prints `MISSES …` on any run where reality regresses — budget kept at 5 s either way),
`[measurement] POST /api/sync … p50 … p95 … — versus documented 200 ms budget: MISSES`,
`TICK_COLOUR>>> hueCarriesState=false`, `hueCarriesState` entries from the colour gate, and four
`lighthouse … score=100` lines (`/sign-in` from `/`, `/history`, `/`, `/session/[id]`).
If a count drifts because a later PR adds a spec, the numbers are in the log, not in this file —
this file quotes a run; the sequence regenerates one.

---

## 17. Two measurement gates flaked under contention — recorded, budgets unmoved (incidental)

The double-run requirement exists for flakes, and it earned its keep: across the runs behind this
audit, two **timing** gates failed once each with nothing injected, both during 4-worker
contention, both green everywhere else.

```
run A of the post-fix set: ✘ tests/e2e/a11y.spec.ts:102 › a whole session can be completed with the keyboard alone (29.5s)
             Error: the session never reached `completed` after a keyboard finish
             Expected: "completed" / Received: "in_progress"
             Call Log: - Test timeout of 30000ms exceeded          ← baseline duration: 15.1s
contended 4-file repro loop, cycle 2: ✘ sla.spec.ts:69 › G-M3-2 — set-tap to local UI update is under 50 ms
             Error: p95 64.8ms exceeds the 50ms goal
             page snapshot at failure: "13 waiting to sync"        ← queue mid-drain, ordinary
other runs, same day: G-M3-2 p95 16.8 / 17.2 / 18.3 / 19.7 / 22.1 / 24.6 ms — PASS

What the captures do and do not prove. The G-M3-2 one is mechanically clear: the budget covers
tap→local-UI including the IndexedDB outbox write, and on a box whose four browsers and server are
all contending, one straggler commit out of n=17 lands at 64.8 ms. p95 over 17 samples is one
sample of slack — that is the definition, not a defect. The keyboard-only one is **not** fully
explained and this file will not pretend otherwise: its 20 s server-status poll was still inside
its own allowance when the 30 s default *test* timeout ended the run — 15.1 s was the baseline
duration, so the flow itself needed ~20 s under contention and the server read may simply have
been waiting on a legitimately-backed-off send (the fix only clears windows on `online`, which this
test never left). The artifacts do not separate "drained late" from "applied slowly under load,"
and neither gets a claim here. Both flakes happened on the **fixed** tree: the post-fix run record
is 60/1 (this a11y timeout) followed by **61/0 three times consecutively** (3.1 m, 3.5 m, 3.6 m),
plus one G-M3-2 breach inside a deliberately contended four-file loop — 1 failure in 5 full runs.
That sequence does not license "fixed" — it licenses the protocol: **re-run before
believing a red timing gate on this machine**, keep the budgets where they are, and let M4's
telemetry/50-rps work decide whether any of these tails is real. A flake's true cost is that
people stop trusting red — which is why these two are written here rather than quietly retried
away.

## 18. The parity gate itself went red on CI — the gate was the broken thing (incidental, CI)

Nine breakages and two flakes later, PR #86's first CI run went red 11 minutes in, on exactly one
test — `legacy-parity.spec.ts:36`, the *untouched-legacy-modules* check, the one whose whole job is
refusing to let M3's claim rest on vibes:

```
  ✘  28 tests/e2e/legacy-parity.spec.ts:36:1 › the four legacy modules are untouched on this branch (7ms)
    Error: Command failed: git diff --name-only origin/main...HEAD -- push-day-workout …
    fatal: bad revision 'origin/main...HEAD'
  60 passed, 1 failed (5.2m)
```

No injection, no contention: the assertion was right and its **environment assumption** was wrong.
`actions/checkout@v4` defaults to a single-commit shallow fetch — in the runner there is no
`origin/main` ref and no merge base to diff against, so a test that passed on every local run
**cannot run at all in CI**. The honest framing: for its entire life on this branch, the legacy
parity gate has only ever been observed on one machine, and the milestone's own invariant — *a
control that has not been watched to fail has not been disarmed* — extends one step further than I
applied it: a gate that only runs where it happens to pass is not running.

Fix (one commit, two files, verified before and after): `resolveBaseRef()` tries `origin/main` →
`main` → `$GITHUB_BASE_REF` via `git rev-parse --verify --quiet <ref>^{commit}`, and the test
**skips loudly** when none resolves — *"no base ref to compare against (shallow clone): the
legacy-parity diff is NOT being checked"* — because an empty diff from a historyless clone is a
vacuous pass, and the failure mode of a vacuous pass is precisely the false green this milestone
refuses to ship. The loud skip alone would still leave M3's headline parity claim unchecked in the
one environment that gates merges, so `test.yml`'s checkout gains `fetch-depth: 0` with a comment
naming this run as its reason: CI now *executes* the gate rather than skipping it honestly.
Verified: locally the three parity tests pass on the real `origin/main` diff (22 ms — the check
that matters most is the cheapest), the full suite re-ran **61 passed / 0 failed**, and CI run 34635840011
on this head went **61 passed / 0 failed in 6.2 m with the parity gate executed, not skipped** (✓
`legacy-parity.spec.ts:61` untouched-modules 11 ms, :80 keys-owned 30 ms, :99 never-written 7.1 s) —
the first time this gate has fired on a runner. `fetch-depth: 0` earned its keep: the gate is now
real on both machines, which is the entire standard this milestone held itself to.

## What the numbers said on the final recorded runs (2026-09-12, this branch, production build)

Five full `npx playwright test` runs on the fixed tree: **61 passed / 0 failed** on the last four
(3.1 m, 3.5 m, 3.6 m, 3.2 m — the fourth is the CI-parity fix of entry 18); the first carried the
one flake recorded in entry 17 (60/1).
Measurements below span the three green runs plus the standalone re-checks, plus the other
suites:

| Measurement | Value |
| :--- | :--- |
| Playwright (×3 final green, ×1 with flake) | 61/0 on the last three; 60/1 once, recorded |
| `npm test` / api+security / lint / typecheck / mutation | 37 files 380 tests / 10 files 60 tests / 0 · 0 · 0 / exit 0 |
| Contrast gate | 35/35 pairs pass (25 leaf + 10 alias-layer) |
| G-M3-2 tap→UI | n=17 **median 13.4–15.3 / p95 17.2–24.6 ms** (< 50) · the n=100 live-connection spec: median 15.0 / p95 19.9 / max 29.0 ms — one contended breach recorded, entry 17 |
| G-M3-3 cross-device | n=5 median 4345–4361 / **p95 4388–4451 ms** (< 5000 — margin is the 4 s poll; STATE §5 and the handoff say so out loud) |
| G-M3-4 drain | **PASSES post-fix: online→empty **1643–1838 ms** (seven measurements), one batch POST [200]; the pre-fix 4693–9660 ms MISSes are kept as measured (entries 4 + 15); the 15 s hang guard asserted and caught the defect |
| `POST /api/sync` ×50 (prod) | p50 171.8–209.6 / **p95 202.9–288.3** / max 216.4–344.8 ms vs documented 200 ms — **MISSES on all four runs** (M2-06's CI saw 222.0; same story, different box); the 800 ms ceiling holds; GET baseline p95 8.5–11.1 |
| Lighthouse accessibility | **100** on all four audited routes, both final runs |
| G-M3-6 | `hueCarriesState=false`; glyph + word + `aria-pressed` carry; word-carrier control per entry 13 |
| Legacy parity | 4 module dirs untouched on `main...HEAD`; 5 legacy keys never written (the scan's own author bug caught per entry 3) |
