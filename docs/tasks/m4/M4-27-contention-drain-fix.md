# M4-27 · Bring the contended 60-mutation drain back inside 5 s with the workstream M4-26 priced

> **M4-27** · Backend implementation · `#priority/p1` · Derived from: **#164** (the breach #91
> measured and filed). **Depends on M4-26** — the spike (`docs/spikes/…-apply-path-costing.md`)
> prices the phases and recommends one of #164's three workstreams, and the owner ratifies that
> pick in a one-line comment on #164. This card does not start before that comment exists, and it
> does not re-litigate the design: the spike's table is the premise. **Closes #164.**

## Intent

Today a client that queues 60 mutations behind a modest crowd (two batch streams + ~11 rps of
ordinary bystander sync — a realistic shared-family load, not saturation) waits **11.7 s** for the
drain where the ratified budget says 5 s. #164's whole point was that this is a real breach on
delivered capacity, and #91's guardrail was that the *budget* is not the thing to edit. This card
moves the reality, not the number.

## Scope

The exact files depend on which workstream M4-26's ratified recommendation names — that dependency
is the design of this card, not an omission. #164's candidate list, for orientation:

1. **Batch the fan-out** — collapse the ~60×(setVersion/changes/store) round-trips per apply into
   set-based statements (e.g. `unnest`-style bulk writes) inside the existing transaction.
2. **Transaction/pool pressure** — shorten or restructure the lock session so bystander syncs stop
   paying 2–4×; pool sizing/queuing if that's where M4-26's table points.
3. **Gate honesty** — only in the degenerate case where pricing shows the fix is not code; a
   venue-honest budget gate would then need its own ruling, which this card must not improvise.

Invariants that survive any of the three, stated now because they constrain the implementation
before it starts:

- **Semantics are frozen.** Same `STALE_CONFLICT` behavior for out-of-order/conflicting mutations,
  same per-legal-set ordering, same idempotency, same rate-limit posture — the existing suites
  (`sync-latency.spec.ts`, the api sync route suites, the 81-spec e2e battery) are the proof, not a
  re-argued design. The staggered-`clientTs` lesson from M4-02 (constant ts → conflict coin-flip)
  stays encoded in whatever load shape verifies this card.
- **Budgets stay frozen.** `G_M3_4_BUDGET_MS=5000`, the 15 s hang ceiling, every wait constant:
  `git diff main -- tests/e2e/sla.spec.ts` must be empty. If the work cannot pass 5 s under
  contention, that is a *finding* to bring back to the owner, not a number to move (STATE item 21
  protocol).
- **No new perf venue.** Verification re-runs the instruments #91 already merged
  (`npm run perf:contention`, `scripts/perf/batch-contention-*.sh`) on the same local box, numbers
  disclosed as local. Nothing here enters CI.

## Acceptance criteria

```gherkin
Scenario: The breach is closed on the instrument that found it
  Given the merged build of this card on the M4-02 venue
  When npm run perf:contention runs the contended leg (2×batch-60 + 8×bg, 200 s)
  Then the batch-class p95 is under 5 000 ms — HOLDS, not "improved"
  And the browser drain under the same load is under 5 000 ms
  And applied=offered and zero rejects on every judged leg (the miss may not be bought with drops)

Scenario: Nothing else got worse to buy the win
  When the solo leg and the bystander class are read on the same runs
  Then solo p50/p95 stay within ~20 % of the recorded band (p50 1 650–1 750 / p95 ≤ 1 950)
  And contended bystander p50/p95 do not exceed the recorded 896/1 075 by more than the same slack

Scenario: Semantics survived
  Given CI on this PR
  Then the full battery is green — unit, api route suites, e2e 81 — with no spec edits
  And no test's conflict/ordering assertions were weakened to pass

Scenario: The instrument still measures (watched, per the board's definition-of-done law)
  When scripts/perf/batch-contention-solo-control.sh's baseline and restored legs re-run post-fix
  Then both still land in the solo band (the fix must not have made the gauge blind)

Scenario: The budget never moved
  Given the diff against main
  Then tests/e2e/sla.spec.ts, every G_M*_BUDGET_MS constant and all wait constants are untouched
  And the docs/perf run book gains a post-fix section with every number above, denominators included
```

## Verification

```bash
npm run typecheck && npm run lint && npm run test
npm run perf:contention -- --duration=200 --label=post-fix-contended
npm run perf:contention -- --duration=200 --label=post-fix-solo --batch-users=1 --bg-users=0
bash scripts/perf/batch-contention-solo-control.sh   # baseline+restored legs only matter; green
git diff main --stat -- tests/e2e/sla.spec.ts         # must be empty
```

Sizing law (per `pk:tasks`): if M4-26's ratified workstream cannot be delivered in one 1–4 h
implementation slice, **re-run pk:tasks on the spike document first** and split this card before
starting it — do not widen this card mid-flight (a Scope Change Record is the other lawful move,
and it is the worse one here).

Close-out: PR body first line plain `Closes #164`; append the post-fix measurement section to
`docs/perf/2026-09-16-m4-91-batch-contention.md`; STATE §5's G-M3-4 answer updates from "MISSES,
filed as #164" to the ratified-and-fixed sentence.
