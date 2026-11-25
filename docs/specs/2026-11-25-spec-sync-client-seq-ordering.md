# Spec: Order same-millisecond writes by the client's outbox sequence

<a id="PLAN-sync-client-seq-ordering"></a>

- **Status**: Planned 2026-11-25. Not yet executed. The owner authorized this route (issue #78, option 1:
  thread the client's monotonic per-session outbox sequence into the conflict comparison) together with
  the Level 2 ceremony, so a Planning Record and a Task Record precede any code. This committee is Level
  2 because it changes a public write contract and adds a persisted column; both are visible outside this
  repository's own process.
- **Date**: 2026-11-25
- **Ceremony**: Level 2 (Controlled) - Code Work. The canonical Task Record is
  `docs/tasks/2026-11-25-sync-client-seq-ordering.md`; this spec supplies its planning inputs and creates
  no execution state.
- **Supersedes**: nothing. Extends `docs/specs/2026-11-19-spec-api-suite-hardening.md` where that spec is
  silent about intra-batch ordering.
- **External reference**: `https://github.com/lowqualityloey/ppl-fitness-tracker/issues/78` - "Two
  mutations for one entity in the same millisecond are decided by a random UUID".
- **Scope**: the sync write path only - the polymorphic mutation contract, one additive migration, the
  Drizzle schema, the repository's sync store, the domain comparison, and the client send call. No
  athlete-visible UI change, no auth or RLS change, no release, tag, or deploy action.

---

## 1. Outcome

Two writes to the same entity that arrive in the same millisecond are ordered by the sequence the client
assigned them, on the device that made them. Today that tie is decided by comparing two random UUIDs, so
the server can keep the older tap.

Concretely, when this work lands:

1. `compareEntityVersions` compares `effectiveTs`, then `deviceId`, then `clientSeq`, then `mutationId`.
2. A mutation may carry an optional `clientSeq`; the server treats a missing one as `0` (unknown).
3. `sync_entity_versions` gains `client_seq integer NOT NULL DEFAULT 0` with a named non-negative check,
   through a hand-authored additive migration `0009_*`.
4. The client re-attaches the `seq` it already stores in its outbox row at send time. No IndexedDB
   migration runs, because `StoredMutation` has carried `seq` since #62.
5. Every existing row, and every batch queued before this deploy, still parses and still compares exactly
   as it does today.

The defect is not a crash. It is silent: the athlete's most recent tap is rejected as `STALE_CONFLICT`
and the older value stands, with no visible cause.

## 2. Explicit non-goals

- **Sub-millisecond client timestamps.** Issue #78 lists this as option 2. It moves the window instead of
  closing it, and it makes `clientTs` a lie about a wall clock. Rejected.
- **Treating same-millisecond same-device as an update rather than a conflict.** Issue #78 lists this as
  option 3 and calls it the weakest option. It hides the ambiguity rather than resolving it, and it would
  need its own cross-device tie rule anyway. Rejected.
- **Changing cross-device ordering.** `deviceId` stays ahead of `clientSeq`, and its lexicographic
  comparison is unchanged. Issue #78 states cross-device ties are correct as they stand.
- **A new client-side ordering mechanism.** The outbox already assigns a serialized monotonic
  `seq` per session; this spec only stops discarding it.
- **Backfilling historical rows.** Pre-existing `sync_entity_versions` rows take `0`, which the comparison
  already handles as "unknown". No data migration, no reconstruction of a sequence that was never
  recorded.
- **A server-side dedupe of double taps.** Deduplicating identical intents is a different feature with its
  own correctness question (is a re-tick at the same weight a no-op or a second set?).
- **Touching `sinceSeq`, `serverSeq`, or the change feed.** Those order server-to-client delivery; this
  spec orders client-to-server acceptance. They are separate counters.

## 3. Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | Order is `effectiveTs` -> `deviceId` -> `clientSeq` -> `mutationId`. | `clientSeq` is a per-session, per-device counter. Comparing two devices' counters would award a systematic win to whichever device holds the larger number, which is not an ordering fact. Putting it after `deviceId` confines it to the only place it means anything. |
| D2 | `clientSeq` is **optional** on the wire and resolves to `0` when absent. | Each mutation schema is `.strict()` and `SyncRequestSchema.safeParse` gates the route. A required field would `400` every batch already sitting in an IndexedDB outbox at deploy time - the exact compatibility the `#105` paragraph in `lib/contracts/sync.ts` promises and `tests/integration/api/sync.test.ts` tests. |
| D3 | `0` means "unknown", not "first". | The outbox assigns `lastSeq() + 1`, so a real mutation never carries `0`. `0` is therefore free, and `0` versus `0` falls through to `mutationId` - byte-for-byte today's behaviour for data written before this change. |
| D4 | Persist a new `client_seq` column rather than reusing `server_seq`. | `serverSeq` is assigned by the server at acceptance and is the ordering the server chose. Reusing it to record the client's intent would make the column mean two things, and it cannot record the intent of a rejected mutation at all. |
| D5 | `NOT NULL DEFAULT 0` via a hand-authored additive migration, no contract step. | House style per `0006` and `0008`: hand-authored SQL, additive, `tests/unit/migration-authority.test.ts` forbids `drizzle-kit` and `supabase/migrations/meta/`. Backfilling the default is the same unknown value D3 already defines. |
| D6 | Re-attach the sequence at send time in `drainOnce`, not inside the stored payload. | `StoredMutation` already has `seq`; storing it twice would create two sources of truth for one fact. A queued batch therefore drains with its sequence and needs no upgrade step. |
| D7 | Prove the fix with a unit test on `compareEntityVersions`. | `tests/e2e/sync-latency.spec.ts` was amended to stagger `clientTs` by 1 ms per request, so it no longer reproduces the defect. A unit test is the only honest proof, and it pins the tie-break directly. |

### 3.1 The exact comparison after this change

```ts
export function compareEntityVersions(
  candidate: Pick<SyncEntityVersion, 'effectiveTs' | 'deviceId' | 'clientSeq' | 'mutationId'>,
  current: Pick<SyncEntityVersion, 'effectiveTs' | 'deviceId' | 'clientSeq' | 'mutationId'>,
): number {
  const timestampOrder = candidate.effectiveTs.getTime() - current.effectiveTs.getTime();
  if (timestampOrder !== 0) return timestampOrder;

  const deviceOrder = compareLexically(candidate.deviceId, current.deviceId);
  if (deviceOrder !== 0) return deviceOrder;

  const seqOrder = candidate.clientSeq - current.clientSeq;
  if (seqOrder !== 0) return seqOrder;

  return compareLexically(candidate.mutationId, current.mutationId);
}
```

`clientSeq` is already a non-negative integer on both sides, so a subtraction is safe and needs no
overflow guard: the outbox counter is bounded by the number of taps in one session.

## 4. Measured baseline

| Fact | Value | How measured |
| --- | --- | --- |
| Defect site | `lib/domain/sync/sync-engine.ts:85-97` | read |
| Caller | `lib/domain/sync/sync-engine.ts:223-241` (`apply`) | read |
| Client drop point | `src/app/state/sync-engine.ts:249-258` (`drainOnce`) | read |
| `StoredMutation.seq` exists | `src/app/state/outbox.ts:32`, assigned at `:167-168` | read |
| Migrations on disk | 9 files, `0000` .. `0008` | `ls supabase/migrations` |
| `compareEntityVersions` references | 2 call sites, 1 definition, 1 spec file | grep |
| Contract shape | `MutationIdentityShape` = `{ mutationId, clientTs, sessionId }`, all four ops `.strict()` | read |
| Repository HEAD at plan time | `a38988124fc04f143c2213cf615c04277ce1f287` | `git log -1` |
| `npm test` | 70 files / 695 passed, exit 0 | background job, 2026-11-25 |
| `npm run test:api` | 14 files / 84 passed, exit 0 | background job, 2026-11-25 |

### 4.1 Why the existing E2E cannot prove this

`tests/e2e/sync-latency.spec.ts:106-120` documents the original reproduction and then sets
`clientTs` to `new Date(firstClientTs + index).toISOString()` so each request is one millisecond apart.
That edit made the suite deterministic and, in the same move, made it blind to the tie it was written to
expose. The comment above the code still describes the defect; the code no longer reaches it.

## 5. Steps

### S0. Write the records before the code

Create this Planning Record and `docs/tasks/2026-11-25-sync-client-seq-ordering.md`. The spec and the
record must land in the **same commit** or `validate-references.sh --strict` emits
`INVALID_LINK|...|Missing PLAN link target or anchor`.

### S1. Contract: an optional `clientSeq`

Add `clientSeq: NonNegativeIntegerSchema.optional()` to `MutationIdentityShape` in
`lib/contracts/sync.ts`. Nothing else in that file changes: the four op schemas spread the shape, and
`.strict()` only rejects *unknown* keys, so an optional member is accepted everywhere.

### S2. Migration `0009_sync_entity_client_seq.sql`

```sql
ALTER TABLE public.sync_entity_versions
  ADD COLUMN IF NOT EXISTS client_seq integer NOT NULL DEFAULT 0;

ALTER TABLE public.sync_entity_versions
  ADD CONSTRAINT sync_entity_versions_client_seq_nonnegative
  CHECK (client_seq >= 0);
```

Header comment names issue #78 and the expand-phase shape, matching `0008`'s opening. Filename must stay
contiguous: `tests/unit/migration-authority.test.ts` requires `0009` to follow `0008` with no gap.

### S3. Drizzle schema

Add `clientSeq: integer('client_seq').notNull().default(0)` to `syncEntityVersions` in
`db/schema/index.ts`, plus the named check beside `entityTypeValid`:

```ts
clientSeqNonNegative: check(
  'sync_entity_versions_client_seq_nonnegative',
  sql`client_seq >= 0`,
),
```

### S4. Domain type

`SyncEntityVersion` in `lib/domain/sync/types.ts` gains `clientSeq: number`. The type is the contract the
repository, the engine, and the tests share, so every literal constructing one must supply it.

### S5. Repository: read, synthesize, write

- `loadVersions` row mapping (`lib/repositories/workout-repository.ts:932-942`) adds
  `clientSeq: row.clientSeq`.
- The three synthesized zero-versions (set ~`:979-987`, task ~`:1005-1013`, session state ~`:1019-1030`)
  add `clientSeq: 0`.
- `upsertEntityVersion` (~`:1163-1178`) copies `clientSeq` into `pendingVersions`.
- `flushTail`'s `onConflictDoUpdate` `set` list (~`:1068-1082`) gains
  `clientSeq: sql`excluded.client_seq``.

Missing any one of those four is silent: the column would persist `0` forever and the comparison would
never see a real sequence.

### S6. Engine: carry the sequence

In `apply` (`lib/domain/sync/sync-engine.ts:223-241`) add `clientSeq: mutation.clientSeq ?? 0` to
`candidateVersion`, and thread the same value into the `upsertEntityVersion` call at `:261-270`. The
comparison function itself changes per section 3.1.

### S7. Client: stop dropping the sequence

`src/app/state/sync-engine.ts:249-258`:

```ts
mutations: batch.map((item) => ({ ...item.payload, clientSeq: item.seq })),
```

### S8. Tests

- `tests/unit/domain/sync-engine.test.ts`: add cases beside the existing tie-breaker test at `:144-154`
  - same device, same `effectiveTs`, `clientSeq` 2 versus 1 -> positive (candidate wins)
  - the same pair with the arguments reversed -> negative (antisymmetry)
  - different devices, `clientSeq` 9 versus 1 -> `deviceId` still decides, not the counter
  - both `clientSeq` 0 and equal -> falls through to `mutationId`, matching today's result
  - engine level on `FakeSyncStore`: seq 1 then seq 2 both apply; the arrival order reversed rejects the
    older one
- `tests/unit/contracts/contracts.test.ts`: in `describe('sync contracts')` a batch **without**
  `clientSeq` still parses unchanged, and one **with** `clientSeq` parses too.

### S9. State file

Replace the `docs/STATE.md:176` bullet under "Open findings" with a closed note naming this record, and
prepend one line to the `\u00a71` "Last Updated" head. The M4 counts do not move: #78 is a filed
finding, not an M4 card.

### S10. Gates, commit, push

`validate-references.sh --strict` exit 0; `validate-execution-control.sh --root .` `VALID`;
`check-setup-assert.sh` `OK`; `check-doctor.sh` unchanged (version `STALE(+9)` alone);
`validate-ci-triage.sh` `ERRORS=60|RECORDS=3` unchanged; `npm run typecheck` exit 0; `npm test` and
`npm run test:api` green. One commit on `main` with a `fix(sync):` subject and the four-line
Constraint / Confidence / Scope-risk / Not-tested trailer. Never stage
`docs/reviews/2026-11-22-promptkit-v2-sync-branch.md`.

## 6. Acceptance criteria

| ID | Criterion | How it is proved |
| --- | --- | --- |
| AC-1 | Same device, same `effectiveTs`, higher `clientSeq` wins. | unit test on `compareEntityVersions` |
| AC-2 | The comparison is antisymmetric for that pair. | the same test with reversed arguments |
| AC-3 | `clientSeq` never overrides `deviceId`. | unit test with two devices and inverted seq values |
| AC-4 | Two unknown sequences still fall through to `mutationId`. | unit test, result equals the pre-change expectation |
| AC-5 | A request without `clientSeq` still parses and still applies. | contract test + `tests/integration/api/sync.test.ts` |
| AC-6 | The sequence round-trips to storage. | integration assertion on `sync_entity_versions.client_seq` |
| AC-7 | The migration is additive and contiguous. | `tests/unit/migration-authority.test.ts` green |
| AC-8 | The client sends the stored `seq`. | unit test on the `send` argument in `src/app/state/sync-engine.ts` |
| AC-9 | Existing suites unchanged. | `npm test` 70/695, `npm run test:api` 14/84 |
| AC-10 | Governance gates unchanged. | the four validators, doctor's single accepted red |

## 7. Risks, failure modes, and rollback

| ID | Risk | Mitigation |
| --- | --- | --- |
| R1 | A missed copy site leaves `client_seq` permanently `0`. | AC-6 asserts the round trip through real storage, not only the in-memory cache. |
| R2 | Optional `clientSeq` silently degrades to "never ordered". | AC-8 proves the client always sends it; D2 keeps old clients working. |
| R3 | A cross-device comparison accidentally uses `clientSeq`. | AC-3 pins `deviceId` precedence; D1 records why. |
| R4 | The migration breaks the contiguous-index gate. | Filename fixed at `0009`; `migration-authority.test.ts` fails loudly if not. |
| R5 | Backfilling `0` changes an existing conflict verdict. | `0` versus `0` falls through to `mutationId`, which is today's exact behaviour (AC-4). |
| R6 | Two sources of truth for the sequence (payload and row). | D6: the payload is never mutated; the value is joined at send time only. |

Rollback: revert the commit. The migration is additive and the column is unused by any read path that
predates it, so a reverted application against a migrated database keeps working; `client_seq` simply
stops being written.

## 8. Open decisions for the owner

- **O1**: whether the 9 unreleased upstream commits after `v2.5.0` (doctor `STALE(+9)`) are reviewed and
  pinned now or left red by design. Unrelated to this spec; carried here so it is not lost.
- **O2**: whether a server-side double-tap dedupe is worth its own card after this lands.

## 9. Follow-ups this plan does not do

- F-1: `tests/e2e/sync-latency.spec.ts` still cannot reproduce the tie. Restoring a true same-millisecond
  E2E would need a controllable clock on the client, which is a test-infrastructure task.
- F-2: the three synthesized zero-versions in `loadVersions` remain a place where "no row yet" and "row
  with unknown sequence" are the same shape. Distinguishing them is a separate modelling question.
- F-3: `scripts/perf-sync-contention.ts` mentions `compareEntityVersions` in prose only; no benchmark
  covers the tie path.

## 10. Provenance

Every number in section 4 came from a command or file read on 2026-11-25 at
`a38988124fc04f143c2213cf615c04277ce1f287`. The test counts came from two background runs of
`npm test` and `npm run test:api` on the same tree.

**Not measured, and not claimed**: whether the defect is reachable through the production client in
practice (the 800 ms debounce and the per-session transaction make a triggering batch rare, as issue #78
already says). This spec fixes the ordering; it does not claim the bug was frequently hit.

Execution gate: no code changes until the owner ratifies this plan and the Task Record exists.
