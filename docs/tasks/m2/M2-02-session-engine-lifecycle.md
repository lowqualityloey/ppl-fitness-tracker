# feat(sessions): implement SessionEngine lifecycle

### Metadata
- **Local Task**: `M2-02`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0003-rls-defense-in-depth.md`, `docs/adrs/0005-design-tokens-and-set-logging.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `type:feature`, `type:test`
- **Kanban Status**: `Done — 2026-09-08`

## User Story & Context

**As a** lifter during an active workout  
**I want** legal phase, task, and set transitions enforced atomically  
**So that** history cannot contain impossible or partially written sessions.

## Technical Scope & Invariants

- Add a deep `SessionEngine` domain/application module and repository mutation methods.
- Cover `start`, `completeSet`, `completeTask`, `advancePhase`, and `finish` per the migration RFC.
- Keep all methods user-scoped and transactionally bound through `withUser()`.
- Enforce the existing session status/phase enums, natural keys, ownership, and one-active-session index.
- Persist weight in canonical kg and nullable reps; never perform display-unit conversion in storage.
- Return mapped `SessionState` values; raw Drizzle rows and SQL details remain behind the repository/error boundary.

### Out of scope

Progression/PR fan-out, sync batching/device metadata, true `since` deltas, legacy import, UI, schema changes, and SMTP.

## Frozen M2-02 lifecycle decisions

- `pre_workout -> exercise` requires the `warm_up` task to be completed.
- `exercise -> rest` and `rest -> exercise` are legal timer-bridge transitions with no server-side elapsed-time enforcement.
- `exercise|rest -> stretch` requires the `main_workout` task and every configured strength set in the routine plan to be completed.
- `stretch -> post_workout` requires the aggregate `stretch` task. The current schema has no per-stretch completion rows, so one task represents the stretch phase without inventing data.
- `finish` is allowed only from `post_workout`; it marks the session `completed` and preserves the terminal phase. `completed` and `archived` sessions reject all lifecycle mutations as conflicts.
- Set writes require an owned main-workout strength placement and `setIndex < targetSets`; kg/reps remain nullable and obey the existing 0–1000 bounds.
- `serverSeq`, device metadata, replay/idempotency ledgers, and true delta semantics remain M2-04 responsibilities. M2-02 leaves `serverSeq` unchanged and uses the existing client timestamps for set/task rows.
- No lifecycle mutation HTTP route is introduced here; the future `/api/sync` reducer consumes this engine after M2-04 freezes its batch/conflict model.

## Implementation Tasks

- [x] Define a pure transition table for status/phase/task gates.
- [x] Add repository transaction methods for set/task/phase/finish mutations.
- [x] Reject illegal transitions, foreign sessions/exercises, invalid set values, terminal sessions, and incomplete required work.
- [x] Add rollback tests proving no partial set/task/session write survives failure.
- [x] Keep the mutation surface route-free until the M2-04 sync contract is implemented.

## Acceptance Criteria

### Scenario 1: Legal lifecycle
- **Given** an owned in-progress session at a legal phase
- **When** the caller completes allowed tasks/sets and advances/finishes
- **Then** each transition is persisted atomically and the final session is completed with `completedAt`.

### Scenario 2: Illegal transition
- **Given** a completed/archived session or a phase-gated incomplete session
- **When** a mutation attempts to advance, write, or finish it
- **Then** the operation returns a typed conflict/validation error and changes nothing.

### Scenario 3: Ownership and bounds
- **Given** a foreign session, foreign exercise, invalid set index, weight, or reps
- **When** a mutation is attempted
- **Then** it returns a safe not-found or validation error and no cross-user row is observable.

### Scenario 4: Transaction rollback
- **Given** a set write followed by a forced task/phase failure
- **When** the transaction aborts
- **Then** neither the set nor the later mutation is persisted.

## Automated Verification

```bash
NODE_ENV=test npm run typecheck
npx eslint lib/domain/sessions/types.ts lib/domain/sessions/transition-table.ts \
  lib/domain/sessions/session-engine.ts lib/repositories/workout-repository.ts \
  lib/http/route-error.ts tests/unit/domain/session-transitions.test.ts \
  tests/integration/repository/workout-repository.test.ts
npx vitest run tests/unit/domain/session-transitions.test.ts tests/unit/http/route-error.test.ts
npx vitest run tests/integration/repository/workout-repository.test.ts
npm test
```

The repository/API integration suites require explicit local Supabase URL/anon/service-role values, `MIGRATION_DATABASE_URL` for owner-only fixture setup, and the tenant-qualified app `DATABASE_URL`; `.env.local` must not be read or modified by the implementation session.

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(sessions): implement SessionEngine lifecycle" \
  --body-file docs/tasks/m2/M2-02-session-engine-lifecycle.md \
  --label "area:backend,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
