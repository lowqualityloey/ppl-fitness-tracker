# M4-27 · Slice A of the priced fix — stop re-mapping the session and re-materializing PRs per mutation

> **M4-27** · Backend implementation · `#priority/p1` · Derived from: **#164**; scoped by the
> **#166 spike** (`docs/spikes/2026-09-16-m4-26-apply-path-costing.md`, merged `9df32c4`), which
> priced the contended 7 566 ms apply wall and found 38 % of it in two per-mutation habits: the
> `refreshState()` full-session remap (1 790 ms) and the per-mutation `materializePersonalRecord`
> (1 075 ms). **Revision note:** this card was filed as the whole fix (#167); the spike's sizing
> law fired and `pk:tasks` re-decomposed it on 2026-09-16 into this slice + **M4-28 (#168)**,
> which carries the budget pass and closes #164. Gate unchanged: **do not start before the owner
> ratifies workstream 1 and this split in a comment on #164.**

## Intent

A 60-mutation batch currently rebuilds the entire session graph — routine day, plan join, every
set row, every task — after *each* mutation, 60 times per batch, to re-derive state it just wrote
(≈330 queries + a quadratic row transfer). It then asks `listSets` for the user's *lifetime* sets
of the touched exercise and recomputes the personal record — also per mutation. Both habits were
visible to the #105 author (one remap was already removed there); this card removes the surviving
two, exactly the groups M4-26 numbered 4 and 5.

This slice deliberately does **not** claim the budget goes green — the tail/reserve/version groups
(M4-28) hold the other half. It is the safer, higher-yield half first, verifiable alone.

## Scope

| | Change | Why this shape |
| :--- | :--- | :--- |
| **Remap** | In `createMutationContext`, set/task upserts stop calling `refreshState()`; instead patch `state.current` in-memory from the row just written (the transaction already knows the upserted values). `advancePhase` and `finish` keep the full `refreshState()`. | Lifecycle assertions read `status`/`phase`; set/task assertions read rows this write just produced. Patching keeps both truthful without re-reading the graph. |
| **Progression** | `upsertSet` records the touched `exerciseId`; `SyncEngine.apply` (or the store around it) materializes each distinct exercise **once, after the loop**, inside the same transaction. | Same-transaction placement preserves both observable failure shapes: `ProgressionValidationError` still aborts the whole request, rollback still all-or-nothing. 60 materializations → ~3 (the slots a batch touches). |
| **Out of scope** | The reserve / version-check / tail query groups — that is M4-28. Any budget move. Any spec edit. Pool or index tuning (excluded by measurement in #166). | The spike split; re-litigating it here is the scope creep this line bans. |

## Acceptance criteria

```gherkin
Scenario: The wall moved by the predicted share
  Given the merged build on the M4-02 venue, contended leg re-run (2×batch60 + 8×bg)
  Then batch-class p50/p95 sit 25–40 % below the pre-fix baseline measured on the SAME DAY
       (a paired pre/post run on one box — cross-day absolutes do not transfer, #166's venue note)
  And solo paired legs shrink by the same share, applied=offered and zero rejects on every leg

Scenario: Semantics are identical, not re-argued
  Then the full CI battery is green — unit, api suites, e2e 81 — with no spec edits
  And the in-memory patch provably matches what the removed remap returned: a targeted
       integration test drives upsertSet and asserts the resulting state.current equals
       a fresh mapSessionInTx read

Scenario: Failure timing survived the move
  Given a fixture mutation that raises ProgressionValidationError
  Then the whole request still fails and nothing from the batch persists, as today

Scenario: The instrument still measures
  When the paired pre/post legs run on the unmodified committed driver
  Then no driver or perf-script file changed (git diff names only lib/ paths)
```

## Verification

```bash
npm run typecheck && npm run lint && npm run test
# paired legs, same session, pre-merge vs post-merge builds:
npm run perf:contention -- --duration=200 --label=A-contended
npm run perf:contention -- --duration=200 --label=A-solo --batch-users=1 --bg-users=0
git diff main --stat -- tests/ scripts/   # empty
```

Close-out: append a slice-A section to `docs/perf/2026-09-16-m4-91-batch-contention.md`
(paired numbers, denominators); the post-fix verdict sentence for #164 belongs to M4-28.
