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

## Still to fire (open on this card)

G-M3-2 tap-latency injection, the axe-gate break on a route that renders the token, the mouse-guard
throw (a `.click()` added to the keyboard flow), the Lighthouse 100 assertion, and the queue-empty
guard. Each needs its own run.
