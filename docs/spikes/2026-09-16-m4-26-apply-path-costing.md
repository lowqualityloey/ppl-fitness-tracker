# M4-26 (#166) spike — price the apply path: every contended second lives in the query fan-out, none of them in the pool or the lock

Status: **priced 2026-09-16 on the same local venue #164's breach was measured on.**
Research work per the card: zero production edits (scratch instrumentation reverted,
`git diff main -- lib/ src/` = 0 at the end of the session), zero budget moves, #164
untouched as parent. This document is the deliverable: the phase table, and one
falsifiable recommendation for M4-27 (#167) to implement after owner ratification.

## The question

#164 listed three workstreams and refused to pre-commit. Every number we owned was
end-to-end: a contended 60-mutation apply is one opaque ~7–9 s wall with lock wait,
~900–1000 round-trips and the commit inside it. This spike splits that wall.

## The instrument (throwaway by law)

`performance.now()` phase accounting patched into `withUser` (per-tx pool-acquire +
RLS-setup line), `applySync` (acquire→lock→engine→commit wall lines per request),
`SyncEngine.apply` (per-request reserve / version-check / applyMutation / tail sums)
and `createMutationContext.upsertSet` (upsert vs progression-materialize vs
state-refresh split), emitted as `[M426] {json}` lines on server stdout. Patched
files: `lib/db/with-user.ts`, `lib/domain/sync/{types,sync-engine}.ts`,
`lib/repositories/workout-repository.ts`. Instrumented BUILD_ID `4EbvVfoFmShR4XJdTuRnS`;
all code reverted; clean rebuild `P9fM_SpXrC52eWp9lVVOD` used for the AC-4 baseline.

Legs: 60 s solo (`--batch-users=1 --bg-users=0`, 30 batches, 1800/1800 applied, 0
rejected) and 60 s contended (2×batch60 + 8×bg@1.25 rps, 15 batches 900/900 applied
0 rejected, 412 bystander syncs all 200). Same committed driver as #91 — no new load
generator, per the card.

## Where the seconds are (mean ms per 60-mutation apply, server-side)

| Phase | solo | contended | × | notes |
| :-- | --: | --: | --: | :-- |
| tx acquire (pool) + RLS set_config | 10.3 | 31.7 | 3.1 | all-tx p50 **7.6 ms**, only 6/427 over 100 ms |
| lockSession `FOR UPDATE` + initial map | 9.3 | 29.4 | 3.2 | the row lock is NOT the convoy |
| engine — `reserveMutation` (2 q/mut) | 219.3 | 925.0 | 4.2 | idempotency select+insert |
| engine — `findEntityVersion` (1 q/mut) | 149.5 | 584.1 | 3.9 | |
| engine — `applyMutation` total | 771.6 | 3 338.5 | 4.3 | split below |
| ·· set upsert (1 q/mut) | 104.8 | 471.6 | 4.5 | |
| ·· progression materialize (2–3 q/mut) | 252.4 | 1 074.5 | 4.3 | `listSets` = the user's **lifetime** rows for that exercise, re-read per mutation |
| ·· state refresh (5 q/mut) | 412.8 | 1 790.1 | 4.3 | `refreshState`→`mapSessionInTx`: day + plan-join + **all session sets** + tasks, per mutation — the #105 comment removed one such remap; the surviving one is 60× per batch |
| engine — tail: seq+version+change+mark (4 q/mut) | 637.8 | 2 633.4 | 4.1 | the single biggest group: 35 % of the contended wall |
| commit residual | 7.3 | 15.7 | 2.1 | fsync is not the story either |
| **apply wall (server)** | **1 808.1** | **7 565.8** | **4.2** | recon: parts sum to engine within 10 ms |

Bystander 1-mutation applies (n=412): wall p50 237.5 / max 635.7 — they pay the same
~4× per-query inflation, which is what their 896→1 145 ms driver-side band was.

**The finding, in one sentence:** there is no convoy — no lock wait, no pool queue, no
commit stall; *every query in the request inflates ~4× uniformly because the request
issues ~15–17 sequential round-trips per mutation (≈900–1 000 per batch) and 10
sessions' worth of those queries keep the 4-core database at CPU saturation*, so the
only workstream that can pay is the one that removes the round-trips.

## Venue honesty (the AC-1 reconciliation, told straight)

This day the box ran hot: load1min 4.97 at first leg start; solo clean-build baseline
came back **p50 1 889.8 / p95 2 447.1** (n=32) — ~8 % above #91's recorded 1 650–1 750
band, verdict still HOLDS; contended driver p50 8 607 / p95 10 896 vs #91's 5 252/6 124.
So this session's **absolute** numbers are not comparable to #91's — the within-pair
ratio (×4.2 solo→contended) and the phase *shares* are what transfer, and AC-1 is read
that way: server wall 7 565.8 + ~1 s client/HTTP ≈ this run's 8 607 driver p50, closed
within the run. AC-4's "instrument still measures" is green in verdict shape (solo
HOLDS, contended MISSES, all-200, applied=offered) with the band delta disclosed above
rather than quoted as a pass of a tighter claim.

## Recommendation (for the owner to ratify on #164, then M4-27 to implement)

**Workstream 1 — batch the fan-out — and all of it, at request level, in five groups:**

1. **Reserve**: pre-check `WHERE mutationId = ANY(...)` + one bulk
   `INSERT … ON CONFLICT DO NOTHING RETURNING` — 120 queries → 2. Replay/conflict
   semantics move with the ANY-set, per-mutation order preserved.
2. **Version check**: one read of all touched entity keys — 60 → 1–2.
3. **Tail**: allocate `serverSeq` once for the batch (single `UPDATE … +n RETURNING`
   keeps monotonic order), bulk-insert `syncEntityVersions` and `syncChanges`, one
   `UPDATE syncMutations … WHERE mutationId = ANY` — 240 queries → ~4.
4. **Refresh**: stop re-mapping per mutation — mutate the in-memory `state.current`
   from the write just performed, and keep the full remap only for lifecycle ops
   (`advancePhase`, `finish`) that assertions actually re-read — ~330 queries + the
   quadratic row transfer → ~5.
5. **Progression**: materialize once per distinct `exerciseId` per request (3 here),
   not per mutation — ~150 queries → ~6–9.

Predicted, falsifiable by the committed instruments on the same venue: **contended
driver p95 moves from 8 600–10 900 to ≤ 3 500 ms (HOLDS), solo p50 to 400–900 ms,
bystander class unchanged or better** (their applies are n=1; they mostly stop
sharing a saturated DB). If a post-fix run lands above 3 500 ms contended p95 the
prediction is wrong and M4-27 reopens the design, not the budget.

**Sizing law fires:** five coordinated query-shape changes + semantics proofs exceed
one 1–4 h slice. Per the M4-27 card's own law, `pk:tasks` should split M4-27 on this
document first; the natural seams above are independently verifiable (each re-runs
the #91 instrument) and group 4+5 alone already removes ~45 % of the contended wall.
