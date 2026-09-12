> **M4-07** · Observability decision · `#priority/p2` · Derived from: handoff §3.2 ("Outbox metrics exist *in UI only* (badge depth); depth/age *metrics* were the FMEA's detection plan and **decide whether that satisfies 'surfaced' or a real metric channel is needed**"); master RFC risk register line: mitigation reads "**Outbox depth + age metric surfaced in UI**".

## Intent
As the user most likely to lose data (a stuck outbox *is* the FMEA's hostage scenario), I want the risk register's mitigation to be literally true — today the runner badge shows **depth only** (`${snapshot.pendingCount} waiting to sync`, verified at `src/app/session/[id]/runner.tsx:518` on 2026-09-12); **age** appears nowhere.

## Scope
One decision + its cheaper implementation:
- **(a)** Extend the existing surface: the badge (or a details affordance) shows the oldest queued mutation's age alongside depth, so a 30-minute stall is distinguishable from a 5-second drain at a glance. Client-only, uses the timestamps `Outbox` already stores per entry.
- **(b)** Or record that UI depth-only satisfies "surfaced" for a single-user app, with the reasoning and the risk-register erratum written down.

## Out of scope
A metrics backend (M4-05/06 are the channels); changing drain/backoff behaviour (locked: the `9ca17cc` connectivity semantics stay).

## Acceptance criteria
```gherkin
Scenario: (a) — age is visible and honest
  Given a queue with one mutation aged past a threshold while the badge still reads a plausible depth
  When the runner renders
  Then the age is displayed per the §4.3 rule that the badge cannot claim "synced" over a refusal — and an E2E spec asserts the *displayed* string against a seeded old entry
  And the spec is watched red with the age rendering removed

Scenario: (b) — the acceptance is a document, not a memory
  When the card closes
  Then docs/STATE.md §5 carries the decision and the risk register's wording is corrected to what actually ships
```

## Automated Verification
```bash
npx playwright test session-runner.spec.ts    # the badge/age spec (or its home spec as shipped)
npm test                                      # outbox unit layer for the age computation
```

## Definition of done
Either the RFC's "depth + age" mitigation is true in the shipped UI with a red-observed control, or it is false *by decision* with the decision on the record. Silence is the only failing outcome.

## Dependencies
- Soft order: after M4-05 so an operational channel exists if (b) is chosen.
