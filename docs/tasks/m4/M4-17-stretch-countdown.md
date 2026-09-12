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
