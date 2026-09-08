# feat(sessions): implement SessionEngine lifecycle

### Metadata
- **Local Task**: `M2-02`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0003-rls-defense-in-depth.md`, `docs/adrs/0005-design-tokens-and-set-logging.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `type:feature`, `type:test`
- **Kanban Status**: `To Do`

## User Story & Context

**As a** lifter during an active workout  
**I want** legal phase, task, and set transitions enforced atomically  
**So that history cannot contain impossible or partially written sessions.

## Technical Scope & Invariants

- Add a deep `SessionEngine` domain/application module and repository mutation methods.
- Cover `start`, `completeSet`, `advancePhase`, and `finish` per the migration RFC.
- Keep all methods user-scoped and transactionally bound through `withUser()`.
- Enforce the existing session status/phase enums, natural keys, ownership, and one-active-session index.
- Persist weight in canonical kg and nullable reps; never perform display-unit conversion in storage.

### Out of scope

Progression/PR fan-out, sync batching/device metadata, legacy import, UI, and SMTP.

## Implementation Tasks

- [ ] Define a pure transition table for status/phase/task gates.
- [ ] Add repository transaction methods for set/task/phase/finish mutations.
- [ ] Reject illegal transitions, foreign sessions, invalid set values, and incomplete required work.
- [ ] Add rollback tests proving no partial set/task/session write survives failure.
- [ ] Add API contract tests for the mutation surface if routes are introduced in this slice.

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
- **Then** it returns 404/403/400 as appropriate and no cross-user row is observable.

### Scenario 4: Transaction rollback
- **Given** a set write followed by a forced task/phase failure
- **When** the transaction aborts
- **Then** neither the set nor the later mutation is persisted.

## Automated Verification

```bash
npm run typecheck
npm test
npx vitest run tests/unit/domain tests/integration/repository
```

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(sessions): implement SessionEngine lifecycle" \
  --body-file docs/tasks/m2/M2-02-session-engine-lifecycle.md \
  --label "area:backend,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
