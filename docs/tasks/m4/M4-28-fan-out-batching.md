# M4-28 · Slice B of the priced fix — batch the reserve/version/tail fan-out and bring the contended drain under 5 s (parent: #164)

> **M4-28** · Backend implementation · `#priority/p1` · Derived from: **#164** via the **#166
> spike**; second seam of the 2026-09-16 `pk:tasks` split of #167. Slice **M4-27 (#167)** removes
> the per-mutation remap/progression (~38 % of the contended wall); this card removes the rest of
> the ~900–1 000 round-trips the spike counted — reserve (12 %), version check (8 %) and the
> tail group (35 %) — and is the card whose AC is *the verdict*: **contended p95 < 5 000 ms**.
> Gate: owner ratification of workstream 1 + the split, as a comment on **#164**, before either
> slice starts; this card additionally must not start before #167 is merged (shared code paths,
> one ordering, no mid-flight surprises).

## Intent

The spike's sentence, verbatim in spirit: there is no convoy — pool, row-lock and commit are all
double-digit milliseconds; the wall is the *number* of sequential queries (≈15–17 per mutation)
amplified ×4.2 by a 4-core database kept CPU-saturated by ten sessions all doing the same thing.
Slice A made each surviving query cheaper to justify; this slice deletes them.

## Scope

The three groups M4-26 numbered 1–3, at request level, inside the existing transaction:

| | Change | Semantics that travel with it |
| :--- | :--- | :--- |
| **Reserve** | `WHERE mutationId = ANY(...)` pre-check + one bulk `INSERT … ON CONFLICT DO NOTHING RETURNING` instead of select+insert per mutation. | Per-mutation `existing`/`new`/`foreign` classification and replay handling stay exactly as `SyncEngine.apply` decides them today — the bulk reads feed the same loop. |
| **Version check** | One read of `syncEntityVersions` (and the `sessionSets`/`sessionTasks` fallbacks for unseen keys) covering every touched entity. | `compareEntityVersions` per mutation runs against the fetched rows; the `clientTs`-stagger rule (#91) is why intra-batch ordering already works and must keep working. |
| **Tail** | Pre-allocate the batch's `serverSeq` range (single `UPDATE … serverSeq + n RETURNING`), bulk-insert `syncEntityVersions` + `syncChanges`, one `UPDATE syncMutations SET status='applied' … WHERE mutationId = ANY(...)`. | Sequence monotonicity per session preserved by construction; `markRejected` paths keep per-mutation updates (they are rare and their seq semantics differ). |

Out of scope: budgets (`git diff main -- tests/e2e/sla.spec.ts` empty), specs, pool/index tuning,
CI venue (verification is the committed local instruments, disclosed as local).

## Acceptance criteria

```gherkin
Scenario: The breach is closed on the instrument that found it   # the falsifiable #166 prediction
  Given the merged build of this card, same venue, contended leg 200 s
  Then batch-class p95 is under 5 000 ms — HOLDS — and the spike's ≤ 3 500 ms prediction is
       confirmed or explicitly corrected with paired numbers
  And applied=offered and zero rejects on every judged leg

Scenario: The whole distribution moved, not one statistic
  Then solo batch p50 lands in the 400–900 ms band the spike predicted
  And contended bystander p50/p95 are no worse than the pre-split baseline on the paired run
  And the browser drain variant of G-M3-4 (Playwright under contention, #91 leg 4 shape) is
       under 5 000 ms

Scenario: Semantics survived the bulk rewrite
  Then CI is fully green (unit, api, e2e 81) with zero spec edits, and specifically
       sync-latency's STALE_CONFLICT shapes and the replay/idempotency suites pass untouched

Scenario: The gauge is not blind and the budget never moved
  When scripts/perf/batch-contention-solo-control.sh re-runs baseline+restored legs
  Then both land inside the post-fix solo band, and the injected leg still MISSES
       (the control proves the instrument still sees a breach even after the fix)
  And every G_M*_BUDGET_MS constant, the 15 s ceiling and all wait constants are untouched
```

## Verification

```bash
npm run typecheck && npm run lint && npm run test
npm run perf:contention -- --duration=200 --label=B-contended
npm run perf:contention -- --duration=200 --label=B-solo --batch-users=1 --bg-users=0
bash scripts/perf/batch-contention-solo-control.sh
git diff main --stat -- tests/e2e/sla.spec.ts   # empty
```

Close-out: PR body first line carries the closing-keyword line for #164 (`Closes` + that number; note: the keyword must appear only in the PR body — in this card, in comments, or in any issue body it fires early, which is exactly how #164 was accidentally closed on 2026-09-16); append the post-fix section to
`docs/perf/2026-09-16-m4-91-batch-contention.md` (all denominators); STATE §5's G-M3-4 sentence
moves from "MISSES, filed as #164" to fixed-with-numbers; #166's prediction gets a confirm/correct
line in the spike doc's tail.
