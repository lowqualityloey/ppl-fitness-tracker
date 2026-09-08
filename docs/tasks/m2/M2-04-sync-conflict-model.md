### Metadata
- **Local Task**: `M2-04`
- **GitHub Issue**: #39 — `feat(sync): implement transactional sync and conflict model`
- **Technical Spec**: `docs/specs/2026-09-08-m2-04-sync-conflict-model.md`
- **Architectural Decisions**: `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `area:data`, `type:feature`, `type:test`
- **Kanban Status**: `Done` — implementation and review fixes complete on `feat/m2-04-sync-conflict-model`; final delivery is the issue-scoped commit/PR.

## User Story & Context

**As a** lifter who may lose connectivity  
**I want** bounded, replay-safe mutations reconciled with server state  
**So that** offline taps are not lost or duplicated when the device reconnects.

## Technical Scope & Invariants

- Implements the four existing mutation contracts: `set.upsert`, `task.complete`, `phase.advance`, and `session.finish`.
- Persists per-session integer `server_seq`, mutation idempotency metadata, per-entity conflict versions, and an additive per-session change log.
- Uses a five-minute server-time clamp for client timestamps, reports maximum absolute clock skew, and resolves ties by normalized timestamp, lowercase UUID device ID, then mutation ID.
- Uses `sync_mutations` idempotency in the same transaction as domain writes, sequence allocation, conflict metadata, change rows, and progression side effects.
- Enforces max 200 mutations, one owned session per batch, verified user ownership, RLS/FORCE RLS, rollback, and authoritative full post-merge state.
- Uses Expand–Contract additive schema evolution; no destructive one-shot migration.

### Out of scope

M3 IndexedDB/client SyncEngine UI, Realtime client wiring, SMTP, true `since` deltas, and the distributed 120-request rate limiter owned by #42.

## Implementation Tasks

- [x] Write and record the sequence/device/conflict decision and migration plan first.
- [x] Add expanded schema/RLS/migration coverage as required.
- [x] Implement the transactional mutation reducer and idempotency ledger.
- [x] Add concurrency, replay, rollback, cross-user, clock-skew, deterministic tie-break, and sequence tests.
- [x] Expose `/api/sync` after domain transaction tests were green.

## Acceptance Criteria

### Scenario 1: Batch happy path
- **Given** an authenticated user and a valid batch of at most 200 mutations for one owned session
- **When** `POST /api/sync` is processed
- **Then** accepted mutations commit atomically, the response includes applied IDs, authoritative full state, the per-session server sequence, and clock skew.

### Scenario 2: Replay idempotency
- **Given** a previously applied or rejected mutation ID
- **When** the same payload is replayed
- **Then** the domain write is not repeated, the response reports the recorded applied/rejected result, and no duplicate sequence/change/PR side effect occurs.

### Scenario 3: Partial/error batch
- **Given** an invalid envelope, foreign session, over-limit batch, stale mutation, or lifecycle conflict
- **When** the batch is submitted
- **Then** envelope/ownership errors are safe and deterministic, known mutation-level conflicts are returned in `rejected`, accepted mutations remain transactionally atomic, and unexpected failures roll back the complete batch without foreign-data disclosure.

### Scenario 4: Deterministic conflict
- **Given** two devices update the same natural entity key
- **When** client timestamps tie or exceed the five-minute skew window
- **Then** normalized timestamp/device/mutation-ID ordering chooses one result deterministically and reports the original clock skew without using raw client time as server sequence order.

## Delivered Files and Boundaries

- `docs/specs/2026-09-08-m2-04-sync-conflict-model.md` — frozen architecture and Expand–Contract decision record.
- `supabase/migrations/0006_m2_04_sync_conflict_model.sql` — additive ledger metadata, entity versions, change log, RLS, policies, grants, and indexes.
- `db/schema/index.ts` — Drizzle schema and relations for the expanded sync model.
- `lib/domain/sync/` — pure hash/clock/conflict policy and transaction-store interfaces.
- `lib/repositories/workout-repository.ts` — one verified-user transaction around the sync reducer and existing lifecycle/progression context.
- `src/app/api/sync/route.ts` and `lib/http/route-error.ts` — thin authenticated canonical-envelope adapter.
- `tests/unit/domain/sync-engine.test.ts`, repository sync cases, RLS/schema-drift coverage, and HTTP sync coverage.

## Review Fixes Applied

- Terminal-session sync locks ownership without requiring `in_progress`, so recorded replays remain idempotent after completion; new terminal mutations still return item-level lifecycle conflicts.
- Mixed-session batches are rejected by `SyncRequestSchema` before authentication/tenant lookup and repository transaction work.
- Foreign mutation-ID collisions return generic `MUTATION_REJECTED` without disclosing another user's ledger row.
- Legacy set rows without entity versions use their stored `clientTs` baseline; explicit lexical UUID ordering is covered for exact timestamp/device ties.
- New and expanded sync RLS policies validate both owned `session_id` and owned `mutation_id` relationships, including insert and reparent attempts.
- Progression overflow remains an intentional transaction-level failure: the repository test proves set, PR, sequence, ledger, and metadata rollback together.

## Automated Verification

- `NODE_ENV=test npm run typecheck` — passing
- Targeted ESLint for all M2-04 source, migration-adjacent schema, and test files — passing
- `npx vitest run tests/unit/contracts/contracts.test.ts tests/unit/domain/sync-engine.test.ts` — 20/20 passing
- Repository integration — 22/22 passing
- HTTP sync integration — 7 passing, 1 explicitly skipped #42 limiter case
- RLS user-data integration — 6/6 passing; schema-drift integration — 6/6 passing
- Full non-API regression suite — 22 files / 186 tests passing
- `git diff --check` — passing

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(sync): implement transactional sync and conflict model" \
  --body-file docs/tasks/m2/M2-04-sync-conflict-model.md \
  --label "area:backend,area:data,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
