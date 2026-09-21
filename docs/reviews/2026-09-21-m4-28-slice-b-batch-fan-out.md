<a id="REVIEW-2026-09-21-m4-28-slice-b-batch-fan-out"></a>
# Senior Code Review: M4-28 slice B — batch the sync fan-out (`#168`, parent `#164`)

- **Review ID**: `REVIEW-2026-09-21-m4-28-slice-b-batch-fan-out`
- **Review Status**: `complete`
- **Resolved Diff Reference**: `git diff 72fa17f...c24b3a9` (`origin/main` → the implementation commit), 1 file changed, +310 / −148
- **Task Record**: `docs/tasks/m4/M4-28-fan-out-batching.md` (Level 2 — Controlled; the card is the spec)
- **Reviewer**: single agent, same conversation as the author — see the fresh-context note below

## Executive Summary

- **Overall Verdict**: **Approved** — one ⚠️ with a working mitigation, no 🚨.
- **Spec Fidelity**: **Clean Match** — the card's groups 1–3 (reserve, version, tail) are implemented; every out-of-scope item is provably untouched.
- **Technical Standards**: **High Quality** — one ⚠️ [IMPORTANT] on an unenforced completion step; the concurrency, ordering and idempotency invariants are preserved by construction and re-verified by the existing suites.

## Axis 1: Spec Fidelity

Reviewed against `docs/tasks/m4/M4-28-fan-out-batching.md`.

| Card clause | Implementation | Evidence |
| :--- | :--- | :--- |
| Reserve: `WHERE mutationId = ANY(...)` pre-check + one bulk `INSERT … ON CONFLICT DO NOTHING RETURNING` | `workout-repository.ts` `loadReservations()`: one `IN` read, one bulk insert, one re-read of only the conflicted remainder | `tests/integration/repository/workout-repository.test.ts` (replay, foreign-collision, `MUTATION_ID_REUSE` cases) |
| Version check: one read plus `sessionSets`/`sessionTasks` fallbacks | `loadVersions()`: one partition read + one batched fallback per entity family | legacy-backfill case (the baseline that the pre-fix fallback established) |
| Tail: pre-allocate the `serverSeq` range, bulk versions/changes, one `markApplied` for the batch | `allocateSequence()` + `flushTail()`: single `server_seq + n RETURNING` claim, bulk upsert, bulk change insert, one `UPDATE … FROM (VALUES …)` | `tests/integration/api/sync.test.ts` asserts exact seq values (`toBe(2)`, `toBe(8)`, `toBe(3)`) |
| Per-mutation classification, replay, `STALE_CONFLICT`, `markRejected` semantics unchanged | `SyncStore` byte-identical; `SyncEngine.apply` untouched; `markRejected` still per mutation | `tests/unit/domain/sync-engine.test.ts` compiles and passes unedited |
| Out of scope: budgets, specs, pool/index tuning, CI venue | `git diff 72fa17f...c24b3a9 -- tests/` → **empty**; `tests/e2e/sla.spec.ts` untouched; no index, no config, no workflow change | measured this turn |

### Missing / Partial Requirements

- None. The card's AC-1/AC-2/AC-3 verdicts are recorded with paired numbers in
  `docs/perf/2026-09-16-m4-91-batch-contention.md` §"M4-28 slice B"; AC-4's control was re-run on the
  committed build and still discriminates (injected p95 7 023.1 ms MISSES → restored 488.8 ms HOLDS).
- **Deliberate non-claims, recorded as corrections rather than passes**: today's pre-leg also held the
  5 s budget (2 543.4 ms), so the 2026-09-16 breach (6 337.9 ms) was not re-observed on this box; and
  #166's predicted solo band (400–900 ms) measured 245.7 ms — below it.

### Scope Creep / Unrequested Behavior

- None detected. Nothing outside `lib/repositories/workout-repository.ts` was touched by the
  implementation commit.

### Implementation Discrepancies

- The card words the version step as "one read of all touched entity keys". The implementation reads
  the session's whole version partition instead — a superset, equal when every touched key belongs to
  the session (it does: all mutations target one session). Recorded as a 💡 below, not a discrepancy
  in behavior.

## Axis 2: Standards & Code Quality

### Accidental Data Loss Audit (STOP AND VERIFY)

No migration, no `DROP`/`TRUNCATE`, no `DELETE`, no filesystem or cloud mutation in the diff
(`git diff … | grep -E '^\+.*(DROP|TRUNCATE|DELETE FROM|rm -rf)'` → none). The one destructive-looking
statement is a bulk upsert, and it is deduped by entity key precisely because Postgres rejects
`ON CONFLICT DO UPDATE` that touches one row twice. Sequence, FK and unique-index invariants
(`sync_changes_session_sequence`, `sync_changes_session_mutation`, `sync_entity_versions_entity_key`)
are all preserved; `sync_entity_versions.mutation_id` still references a row inserted in the same
transaction.

### 🚨 [BLOCKING]

- None.

### ⚠️ [IMPORTANT]

- **`lib/repositories/workout-repository.ts` — `flushTail()` is a required step the type system does
  not enforce.**
  - *Finding*: `syncStore()` now returns `{ store, flushTail }`. If a future caller runs
    `new SyncEngine(store).apply(request)` and forgets the flush, the batch commits with every
    mutation left `processing`, no version rows, no change rows — and the client's next poll sees
    nothing. The failure is loud only later: replaying one of those ids hits
    `SyncConflictError('The mutation is currently being processed.')`.
  - *Mitigation already present*: the handle shape forces the caller to observe `flushTail`; there is
    exactly one caller; `applySync` calls it on the line after `apply()`; and `flushTail` itself
    throws on an unbalanced ledger rather than committing a partial tail.
  - *Remedy*: fold the pair into one unskippable helper (e.g. `runSyncBatch(tx, …): Promise<SyncApplyResult>`
    that owns the engine call *and* the flush), or assert in `currentServerSeq()` when the engine's
    return path is reached with an unflushed non-empty ledger.

### 💡 [SUGGEST]

- **`syncStore().reserveMutation` ignores the `payloadHash` argument** it still accepts.
  - *Finding*: the bulk insert has to hash every *unseen* mutation before the engine ever reaches
    them, so the store recomputes with the same pure `canonicalMutationHash`. The interface keeps the
    parameter (engine and fake untouched), which makes it look read and unused.
  - *Remedy*: either name the reason in the parameter's doc, or move hashing wholly into the store and
    drop the parameter from `SyncStore` — the latter touches the engine and its fake, so it is not
    worth doing inside this card.
- **`loadVersions` reads the session's whole version partition.** Bounded by the session's own entity
  count and served by the `sync_entity_versions_session_lookup` index, so it is the right trade today
  (one read versus a 60-pair composite `IN` list). If a session ever holds hundreds of entities,
  switch to a tuple `IN` built with `sql.join`.

### Diagnostics Evidence

- **Evidence Source**: `tsc-cli` + `eslint-cli`, executed this session on this revision.
- Both are clean, so there are no in-diff diagnostics to tabulate: `npm run typecheck` exit 0,
  `npm run lint` (`--max-warnings=0`) exit 0. No `not measured` rows.

### 👏 [PRAISE]

- **Exact sequence claim instead of a surplus range.** `flushTail` bumps `server_seq` by exactly the
  number of applied mutations and arithmetic keeps the r-th at `base + r`, so the API's exact-value
  assertions still hold. A pre-allocated upper bound would have been simpler and would have gone red.
- **The dedupe in the bulk version upsert is load-bearing and documented as such** — the sequential
  form silently overwrote a repeated entity, and the batched form cannot, so the code says why it
  dedupes rather than looking like tidiness.
- **Write-through on `upsertEntityVersion`** is what keeps a later mutation in the same batch
  comparing against the version an earlier one wrote; without it the prefetch would have quietly
  weakened `STALE_CONFLICT` within a batch.
- **The slot-key/cache-key bug is now a comment, not a footnote.** The set fallback iterates the
  wanted keys because the failure mode (a cache miss read as "no baseline", turning a stale write into
  an applied one) is exactly what the repo's legacy-backfill integration case exists to catch — and it
  did.

## Simplification Audit

- **Audit Status**: `complete`
- **Resolved Diff Reference**: `72fa17f...c24b3a9`
- **Audit Result**: `Candidate(s) recorded`
- **Authority**: `pk:review`; this report is the sole home for findings and recommendations

<a id="SIMPLIFICATION-REVIEW-2026-09-21-m4-28-slice-b-batch-fan-out-001"></a>
#### Simplification Candidate: `SIMPLIFICATION-REVIEW-2026-09-21-m4-28-slice-b-batch-fan-out-001`

- **Candidate ID**: `SIMPLIFICATION-REVIEW-2026-09-21-m4-28-slice-b-batch-fan-out-001`
- **Classification**: `control-flow reduction`
- **Affected Location**: `lib/repositories/workout-repository.ts` — `loadVersions()`, the `missingSets` map
- **Diff Evidence**: the sets fallback now iterates `wanted` (not `missingSets`), so `missingSets` survives only as a carrier for the `exerciseId` list handed to one `inArray`
- **Behavior-Preservation Condition**: the same `sessionSets` rows are read, the same cache entries are written (version or `null` per key), and the `inArray` predicate keeps the same exerciseId set
- **Risk**: low — a wrong collapse would surface as a cache miss, which the legacy-backfill integration case reds immediately
- **Verification Action**: `npm test` (65 files / 626 tests) plus the same-day contended driver leg
- **Recommendation**: collapse `missingSets` into a `Set<string>` of exerciseIds while iterating `wanted` to collect them, removing one intermediate `Map` whose keys are no longer read

## Independent Fresh-Context Verification (Level 2)

- **Not performed — no subagent host is available in this environment.** Recorded as `not measured`
  rather than claimed. Substitute evidence, all executed this session: the fixed-point diff, the
  card's AC-1…AC-4, `npm test` (626), `npm run test:api` (81), `npm run test:e2e` (81), the paired
  same-day driver legs, and the solo control run on the committed build. The residual risk this
  leaves is confirmation bias on my own diff, which the two red-then-green instrument runs and the
  one real bug the integration suite caught before commit partially offset — they were not authored
  to agree with the change.

## Completion Criteria

- Dual-axis evaluation completed (Spec Fidelity vs Technical Standards).
- Durable report saved with its `REVIEW-2026-09-21-m4-28-slice-b-batch-fan-out` anchor.
- Zero unaddressed 🚨 data-loss or security findings (none were raised).
- Every smell is linked to an actionable remedy; one simplification candidate recorded.
- Verification executed against the revision under review: typecheck 0 · lint 0 · unit/integration
  626 · api 81 · e2e 81 (zero spec edits).
