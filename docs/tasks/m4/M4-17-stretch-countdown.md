> **M4-17** · M3 named non-goal · `#priority/p2` · Derived from: handoff §3.4 bullet 1 ("**Per-stretch countdowns.** Only the between-sets `rest` phase drives a real timer; the stretch section renders 'rest 90s' as *static text* … Either wire the sequence to the same `TimerController` or **remove the misleading seconds**"). Verified on `main` 2026-09-12: `src/app/session/[id]/runner.tsx` — `<RestTimer>` is gated to `phase === 'rest'` (:577) while the stretch list emits `· rest ${placement.restTime}` as plain text (:652), and `restTime` values are seeded strings like `'60-90s'` — a *range*, which a countdown cannot bind without a parse decision (the runner's own comment at :66 records it).

## Intent
As an athlete working through cool-down, I want the seconds the screen shows me to be seconds the app is actually counting — a static "rest 60-90s" is instruction text wearing a timer's clothing.

## Scope (the handoff's fork, decided once)
- **A — wire**: the stretch phase gains a real countdown (sequence-aware, one active row at a time), driven by `TimerController` with **absolute deadlines** (STATE §4 item 10: `endsAt`, never a decrementing counter; background-tab recovery like #64's). Needs the range problem solved *honestly*: `'60-90s'` must yield a policy (count to 60? 90? per-exercise config?) — recorded in the PR, not guessed silently.
- **B — demote**: strip the `· rest …` suffix to clearly declarative text (e.g. a muted "hold 60–90 s" label, or remove entirely), so no number on screen implies a running count.
- Either way: the tick rows in the stretch section stay absent (the schema forbids stretch set-rows — `assertSetMutationAllowed`, comment at :636-641 — do not "fix" that).

## Out of scope
Timer persistence across reload (M4-18, deliberately separate); audio cue changes beyond reusing `audio-cue.ts` if option A.

## Acceptance criteria
```gherkin
Scenario: Numbers imply clocks, or clocks show, under A
  Given a stretch phase entered with timers wired
  When the sequence advances
  Then each active countdown is TimerController-driven (unit-proven through the injected clock: throttle-proof, completion fires once per anchor)
  And an e2e spec observes the visible digits moving — the spec is watched red when the component is replaced by static text (the inversion of today's reality, which is the point)

Scenario: Under B, no stranded promise
  When the stretch section renders
  Then no element's text is a duration the app does not count — asserted structurally in the existing runner specs

Scenario: The range decision is written down
  Given option A
  When the countdown policy for '60-90s' is asked
  Then the code + docs name the chosen policy and why the seed's two endpoints were not silently averaged
```

## Automated Verification
```bash
npm test    # timer-controller layer + whatever new unit specs
npx playwright test timers.spec.ts session-runner.spec.ts
```

## Definition of done
Handoff §3.4's first bullet retires: nothing on the stretch screen reads like a timer unless a timer is running, with the chosen fork's control observed firing.

## Dependencies
- M4-11 first if option A adds timer e2e specs (don't grow the flake surface on a flaky base).

## Outcome

**Delivered: option A.** The stretch phase now counts down through the same `TimerController` as the
rest timer, one hold at a time. (`lib/domain/sessions/stretch-timing.ts`, `src/app/session/[id]/runner.tsx:1030-1200`.)

**The card's premise was wrong, and the measurement is the first finding.** It described `main` as
rendering "rest 60-90s" as *static text*. `main` rendered **no hold length at all**. The list did emit
`· rest ${placement.restTime}`, but `rest_time` is NULL on every stretch placement by construction —
`db/seed/stretches.ts` inserts NULL there — so the suffix interpolated to an empty string and the
athlete saw a bare exercise name. The real measurement of a stretch is `exercises.duration_seconds`
(15 seeded stretch rows: 30 s ×12, 45 s ×3), not `rest_time`, which is the gap *between sets* and
means nothing for a hold. `stretchCountdownMs()` therefore reads `durationSeconds` first and only
falls back to `restTime`.

**The range policy: `lower-bound`** (`STRETCH_RANGE_POLICY`). A seeded value like `'60-90s'` resolves
to 60 s, never to 90 s and never to a midpoint. Over-holding is the only injurious error — a stretch
taken past its range risks strain, while finishing early is recoverable and self-correcting; and a
midpoint (75 s) invents a number neither endpoint states, which is worse than picking one stated
endpoint. The unit spec pins this: 60 000 ms, and explicitly `not.toBe(90_000)` / `not.toBe(75_000)`.
A hold with no readable length renders no clock at all (`null`, not `0`) — a `0:00` that finishes on
arrival would be a timer pretending something happened.

**A second, real defect surfaced only once the digits were real:** the `StretchSequence` effect
depended on `active`, an object rebuilt on every parent render (`stretchPlacements` is unmemoized, so
`stretchRows` changes each render, and the session clock re-renders the parent once a second). The
effect therefore tore the timer down and re-ran `start(Date.now() + activeMs)` every second, pinning
the display at `0:30` forever. The effect now keys off the primitive `activeName` instead. This is the
module's own thesis turned on its caller: a clock that gets restarted is not a clock.

**Evidence.**
- Watched red, honestly: with the finished component's digits replaced by the literal `'0:30'`, the
  spec fails on `before - after >= 9` with **Received: 0** (`tests/e2e/timers.spec.ts:431`); restoring
  the real body turns it green. The red is a *digit-delta* failure, not a setup failure.
- `npx playwright test timers.spec.ts session-runner.spec.ts` → **13 passed (2.4m)**, serially, on a
  fresh build (the 100-tap paint spec measured p95 18.0 ms against its 50 ms gate).
- The spec scopes its "no clock yet" assertion to `[data-testid^="stretch-remaining-"]` on purpose:
  `session-elapsed` is itself `role="timer"` for the whole session, so a bare `[role="timer"]` count
  can never read zero once a workout starts. That trap cost one red run and is now a comment in place.
- Tick rows in the stretch section remain absent: `assertSetMutationAllowed` throws for any phase
  outside `exercise`/`rest`, so the schema — not a missing feature — is what forbids them.
