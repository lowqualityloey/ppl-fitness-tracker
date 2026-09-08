# feat(sync): implement transactional sync and conflict model

### Metadata
- **Local Task**: `M2-04`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `area:data`, `type:feature`, `type:test`
- **Kanban Status**: `To Do`

## User Story & Context

**As a** lifter who may lose connectivity  
**I want** bounded, replay-safe mutations reconciled with server state  
**So that offline taps are not lost or duplicated when the device reconnects.

## Technical Scope & Invariants

- Implement the four existing mutation contracts: `set.upsert`, `task.complete`, `phase.advance`, and `session.finish`.
- Decide and document persisted `deviceId`, change-log/per-row sequence, `server_seq` width, clock-skew handling, and deterministic LWW tie-breaking before coding.
- Use `sync_mutations` idempotency in the same transaction as domain writes.
- Enforce max 200 mutations, verified user ownership, RLS, rollback, and authoritative post-merge state.
- Use Expand-Contract for any new metadata/change tables or columns; no destructive one-shot migration.

### Out of scope

M3 IndexedDB/client SyncEngine UI, Realtime client wiring, SMTP, and claiming true `since` deltas before the change model exists.

## Implementation Tasks

- [ ] Write the sequence/device/conflict decision and migration plan first.
- [ ] Add expanded schema/RLS/migration coverage as required.
- [ ] Implement transactional mutation reducer and idempotency ledger.
- [ ] Add concurrency, replay, rollback, cross-user, clock-skew, and sequence tests.
- [ ] Expose `/api/sync` only after domain transaction tests are green.

## Acceptance Criteria

### Scenario 1: Batch happy path
- **Given** an authenticated user and a valid batch of at most 200 owned mutations
- **When** `POST /api/sync` is processed
- **Then** all valid mutations commit atomically, the response includes applied ids, authoritative state, server sequence, and clock skew.

### Scenario 2: Replay idempotency
- **Given** a previously applied mutation id
- **When** the same mutation is replayed
- **Then** the domain write is not repeated, the response identifies it as already applied, and no duplicate side effect occurs.

### Scenario 3: Partial/error batch
- **Given** an invalid, foreign, over-limit, or conflicting mutation
- **When** the batch is submitted
- **Then** validation/rejection is deterministic, no foreign data is disclosed, and transaction boundaries match the documented all-or-reject policy.

### Scenario 4: Deterministic conflict
- **Given** two devices update the same natural set key
- **When** client timestamps tie or skew exceeds the threshold
- **Then** the documented server/device tie-break chooses one result deterministically and reports clock skew without using untrusted client time as server order.

## Automated Verification

```bash
npm run typecheck
npm test
npx vitest run tests/unit tests/integration
```

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(sync): implement transactional sync and conflict model" \
  --body-file docs/tasks/m2/M2-04-sync-conflict-model.md \
  --label "area:backend,area:data,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
