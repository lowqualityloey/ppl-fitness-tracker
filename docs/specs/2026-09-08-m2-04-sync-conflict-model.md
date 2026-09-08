# M2-04 Sync Conflict Model

**Status:** Approved for implementation
**Issue:** #39 — `feat(sync): implement transactional sync and conflict model`
**Milestone:** M2 Core Domain Engine
**Date:** 2026-09-08

## 1. Problem and boundary

Authenticated clients need a bounded server sync boundary that can replay offline mutations without duplicating domain side effects, preserve session ownership, and resolve concurrent writes deterministically. The server remains authoritative for lifecycle state, progression records, and ordering.

M2-04 implements the server path for the four existing mutations:

- `set.upsert`
- `task.complete`
- `phase.advance`
- `session.finish`

The route accepts one session per batch because the response contract contains one authoritative `state` object and one session sequence. A request containing mutations for multiple sessions is rejected before any write. The request limit remains 200 mutations.

### Explicit non-goals

- No IndexedDB/outbox/client SyncEngine, Realtime wiring, or offline UI; those are M3.
- No SMTP, legacy import, nutrition, social, or routine-builder work.
- No service-role or migration-owner connection in request-path code.
- No destructive migration or implicit repair of the known Drizzle migration journal mismatch.
- No true delta response for `sinceSeq` in this slice. The persisted sequence/change model is added and advanced, but the response continues to return authoritative full session state until a later contract explicitly defines delta payloads.
- No 120-request rate limiter in this issue. The existing RED baseline identifies that as route hardening owned by #42; M2-04 still enforces the 200-mutation request bound.

## 2. Frozen decisions

| Concern | Decision | Rationale |
| --- | --- | --- |
| Sequence scope | Per-session `serverSeq`, represented as the existing PostgreSQL `integer` and incremented once per newly applied mutation | `SyncResponseData` returns one session state; the existing `workout_sessions.server_seq` already establishes this scope. Integer is sufficient for the M2 per-session contract and avoids an incompatible width change. |
| Sequence authority | Lock the session row, increment from its current value, and write the same value to the change row and mutation ledger | One row lock prevents duplicate sequence values under concurrent devices. Replays and rejected conflicts do not advance the sequence. |
| Device identity | Request `deviceId` is a UUID; the original device ID is persisted on every new mutation ledger row and conflict-version row | The request is the only trusted source of device identity. It is never accepted as a user identity or ownership selector. |
| Current conflict metadata | Add a generic per-session entity-version table keyed by `(sessionId, entityType, entityKey)` | Sets, tasks, and session lifecycle state need the same deterministic comparison without duplicating metadata columns across unrelated tables. |
| Entity keys | `set:<exerciseId>:<setIndex>`, `task:<taskKey>`, and `session:state` | Keys are stable, scoped to the locked session, and sufficient to identify the mutation target without storing arbitrary client payloads. |
| Timestamp normalization | Capture one server `receivedAt` per request. Clamp each client timestamp to `[receivedAt - 5 minutes, receivedAt + 5 minutes]` for conflict ordering; retain the original `clientTs` for domain data and reporting | Client clocks may be wrong, but client timestamps remain useful within a bounded window. Clamping prevents an arbitrarily old/future client clock from becoming server ordering. `clockSkewMs` reports the maximum absolute original-clock difference. |
| Conflict tie-break | Higher normalized timestamp wins; equal timestamps use lexicographically greater lowercase UUID `deviceId`; an exact device/timestamp tie uses lexicographically greater `mutationId` | The result is deterministic across retries and devices without treating client time as server sequence order. |
| Legacy rows | Existing sets/tasks without a sync version use their stored `clientTs` and the all-zero UUID as the baseline device. Existing session lifecycle state without a version is treated as the baseline state at sequence 0 | M2-02/M2-03 data remains readable and receives metadata on its first sync write without a backfill that invents device history. |
| Idempotency | `sync_mutations` stores canonical payload hash, operation, device, session, status, sequence, and rejection reason. Same ID + same hash replays the recorded result; same ID + different hash is rejected as mutation-ID reuse | Replay must not repeat domain writes or PR materialization, and the server must detect accidental key reuse. |
| Batch atomicity | Envelope/schema errors reject the whole request before a transaction. A valid batch runs in one transaction; deterministic per-mutation conflicts/domain rejections are recorded and returned while accepted mutations commit atomically. Unexpected database/domain failures roll back all writes, including ledger, sequence, change, set, task, phase, finish, and PR writes | The response has `applied` and `rejected` arrays, so known mutation-level conflicts must be representable without losing valid offline work. The transaction remains the atomic unit for all accepted work and its side effects. |
| Batch order | Input order is authoritative and preserved. Later mutations observe earlier accepted state in the same transaction | Lifecycle mutations such as task → phase → set → finish have meaningful ordering, and the client outbox already defines the intended order. |
| Foreign targets | A session not visible to the verified user is a safe `NOT_FOUND` response; no foreign mutation ledger row or state is exposed | The route must not disclose whether another user's session or mutation ID exists. Every repository lookup remains explicitly user-scoped and RLS-protected. |
| `sinceSeq` | Validate and accept it, return current authoritative state and `serverSeq`, but do not claim a delta | The new change log establishes ordering for a future delta contract without fabricating a delta payload from insufficient history. |
| Rate limiting | Defer the 120 requests/minute behavior to #42 | It is route hardening rather than the M2-04 mutation model; this keeps the issue boundary explicit and avoids an in-memory limiter presented as production distributed protection. |

## 3. System flow and module boundaries

```text
POST /api/sync
  -> strict SyncRequestSchema + one-session refinement
  -> requireUserContext()                 [verified Auth identity]
  -> WorkoutRepository.applySync()        [one withUser transaction]
       -> lock owned workout session
       -> SyncEngine.reduce(batch, transaction store)
            -> check mutation ledger / payload hash
            -> compare entity version and conflict metadata
            -> apply accepted operation through SessionMutationContext
            -> materialize PR only for a winning set write
            -> increment session sequence
            -> write mutation ledger, entity version, and change row
       -> map authoritative session state
  -> SyncResponseSchema envelope
```

`SyncEngine` owns batch ordering, replay/conflict policy, timestamp normalization, and response accumulation. `WorkoutRepository` owns user assertion, transaction-local RLS claims, row locks, SQL persistence, and the transaction-bound adapter. The existing `SessionMutationContext` remains the lifecycle write seam, so sync does not duplicate phase gates, task ownership, set validation, finish rules, or progression behavior.

A winning set mutation calls the existing `ProgressionEngine` only after the set upsert. A stale/rejected set never calls progression. A replay never calls the mutation context.

## 4. Data model and Expand–Contract plan

### 4.1 Expanded schema

Keep `workout_sessions.server_seq integer NOT NULL DEFAULT 0` for compatibility and add:

1. Expand `sync_mutations` with nullable compatibility columns for existing ledger rows:
   - `session_id uuid`
   - `device_id uuid`
   - `operation text`
   - `payload_hash text`
   - `status text` constrained to `applied` or `rejected`
   - `server_seq integer`
   - `rejection_reason text`
   - indexes for `(user_id, session_id, applied_at)` and `(user_id, session_id, server_seq)`
2. Add `sync_entity_versions`:
   - `id uuid` primary key
   - `user_id uuid`, `session_id uuid`
   - `entity_type text` constrained to `set`, `task`, or `session`
   - `entity_key text`
   - original `client_ts timestamptz`
   - normalized `effective_ts timestamptz`
   - `device_id uuid`
   - `mutation_id uuid`
   - `server_seq integer`
   - unique `(session_id, entity_type, entity_key)`
   - indexes for `(user_id, session_id)` and `(session_id, server_seq)`
3. Add `sync_changes`:
   - `id uuid` primary key
   - `user_id uuid`, `session_id uuid`
   - `server_seq integer`
   - `mutation_id uuid`
   - `entity_type text`, `entity_key text`, `operation text`
   - `created_at timestamptz`
   - unique `(session_id, server_seq)` and `(session_id, mutation_id)`
   - index `(user_id, session_id, server_seq)`

All new user-owned tables receive `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, four discrete `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies for `app_authenticated`, and explicit table grants. `sync_entity_versions` and `sync_changes` carry `user_id` directly so every policy and application query has an explicit owner predicate; foreign keys to the owned session preserve referential integrity.

### 4.2 Expand–Read/Write–Contract sequencing

- **Expand:** add nullable ledger metadata and the two new tables/indexes. Existing code remains valid because the old ledger columns and `server_seq` remain present. Add schema/RLS assertions and migration coverage.
- **Read/write switch:** new sync code writes all metadata, uses entity versions for conflict decisions, and advances the existing session sequence. Legacy rows without version metadata are handled using the baselines above. The existing session detail endpoint continues returning full state.
- **Contract:** not part of this PR. A later migration may make ledger metadata non-null after historical rows are observed/backfilled and may add a true delta response. No old column/table is dropped here.

The migration must be explicit and reviewed; do not regenerate or silently repair unrelated migration journal metadata.

## 5. API and error contract

`POST /api/sync` uses the existing canonical envelope and `SyncRequestSchema`/`SyncResponseSchema`.

- `401 UNAUTHENTICATED`: missing or invalid verified Auth context.
- `400 VALIDATION_ERROR`: malformed JSON, invalid mutation fields, more than 200 mutations, mixed session IDs, or an invalid `sinceSeq`/`deviceId`.
- `404 NOT_FOUND`: the target session is not visible to the authenticated user; no foreign existence is disclosed.
- `200 OK`: `serverSeq` is the current per-session sequence, `applied` contains newly applied and same-payload replay IDs once each, `rejected` contains deterministic mutation-level reasons, `state` is authoritative full session state, and `clockSkewMs` is the maximum absolute original timestamp skew observed in the request.
- `409 CONFLICT` is reserved for a transaction-level session conflict that prevents the request from being evaluated; ordinary stale/LWW conflicts are item-level `rejected` results in a successful response.
- `500 INTERNAL_ERROR`: unexpected failures, with no SQL, stack, identity, or foreign-data disclosure; the transaction is rolled back.

The route derives `userId` only from `requireUserContext()`. `deviceId`, `sessionId`, and mutation fields are data, not authorization inputs.

## 6. Failure-mode analysis

| Failure | Detection | Mitigation |
| --- | --- | --- |
| Duplicate mutation replay | Ledger lookup/hash comparison under the session transaction | Return recorded status; do not invoke domain operation, increment sequence, or materialize PR again |
| Same mutation ID with changed payload | Existing ledger hash differs | Reject as mutation-ID reuse without changing state |
| Concurrent same-session devices | `workout_sessions FOR UPDATE` | Serialize reducer, sequence allocation, entity-version comparison, and change writes |
| Stale set/task/session mutation | Version comparison using normalized timestamp/device/mutation ID | Record deterministic rejection; do not write domain row or PR |
| Invalid lifecycle mutation | Existing transition assertions throw known domain error | Record item rejection and continue according to batch order |
| Unexpected failure after one accepted item | Transaction rollback | No partial domain, PR, ledger, sequence, version, or change rows survive |
| Cross-user session or mutation ID | User predicate plus RLS; inaccessible session maps to safe 404 | Do not reveal foreign row or create foreign-owned ledger data |
| Client clock far outside server time | Absolute skew calculation and five-minute clamp | Report `clockSkewMs`; never use raw unbounded client time for ordering |
| Sequence collision | Session row lock and unique `(session_id, server_seq)` | Retry is not needed inside the serialized transaction; database constraint is final guard |
| RLS claim leakage | Existing `assertUserContext()` and `withUser()` transaction setup | Keep all sync SQL inside the repository's user-scoped transaction; use app role only |
| Progression side effect on stale write | Engine invocation location | Materialize PR only after a winning set upsert; rollback covers set and PR together |

## 7. Test-first implementation gates

1. **Contracts/policy unit tests:** canonical hash, timestamp clamp/skew, entity keys, version comparison, replay classification, batch same-session rule, and response semantics.
2. **Repository/transaction tests:** happy path for all four operations, sequence monotonicity, replay without duplicate writes, changed-payload reuse, stale winner/tie-break behavior, concurrent submissions, rollback of domain plus ledger/change/version/PR rows, and authoritative state.
3. **Security/RLS tests:** cross-user session rejection, no foreign ledger visibility, app-role access to new tables, four-policy coverage, and schema drift assertions.
4. **HTTP tests:** authenticated happy path, all four operations, 200-mutation boundary, 201 rejection, replay, mixed-session validation, safe cross-user response, canonical 401/400/404/500 envelopes, and response schema. The existing 120-request limiter assertion remains tracked for #42.
5. **Gates:** `npm run typecheck`, targeted ESLint, focused sync unit/repository/API tests, full non-API suite, schema/RLS checks, `git diff --check`, and no secret-file access or changes.

## 8. Rollback and operational notes

The Expand phase is additive and reversible by deployment rollback because old runtime code ignores new nullable metadata and tables. The new runtime is safe to roll back before the Contract phase because the original `server_seq` and ledger columns remain available. If a migration is applied but code deployment fails, no existing session or ledger behavior is changed. Contract cleanup requires a separate reviewed migration after historical rows are backfilled and all running code versions no longer reference compatibility columns.
