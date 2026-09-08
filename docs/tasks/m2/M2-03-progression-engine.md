# feat(progress): implement e1RM and personal records

### Metadata
- **Local Task**: `M2-03`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0003-rls-defense-in-depth.md`, `docs/adrs/0005-design-tokens-and-set-logging.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `area:data`, `type:feature`, `type:test`
- **Kanban Status**: `Done — 2026-09-08`

## User Story & Context

**As a** lifter logging weight and reps  
**I want** a reliable e1RM trend and personal-record materialization  
**So that** progress reflects committed training data rather than fabricated dashboard metrics.

## Technical Scope & Invariants

- Define the e1RM formula and rounding/null/zero policy in a pure domain module.
- Materialize `personal_records` by `(userId, exerciseId)` inside the same transaction as the source set mutation.
- Scope all reads/writes by verified user and enforce exercise/session ownership.
- Store kg canonically; display-unit conversion is outside this task.
- Recompute the maximum eligible completed set after every set upsert so editing a record-setting set cannot leave a stale PR.

### Out of scope

Sync conflict resolution, device ids, import, chart UI, SMTP, routes, and changing the existing schema without an Expand-Contract plan.

## Frozen M2-03 progression decisions

- Use the Epley formula: `e1rm = weightKg * (1 + reps / 30)`.
- Round once to two decimal places before comparison and persistence, using kg as the canonical unit.
- Incomplete sets, nullable kg/reps, and zero kg/reps remain valid set logs but are not progressable and do not create a zero-valued PR.
- Negative, non-finite, and values outside the existing 0–1000 kg/reps bounds are validation errors.
- E1RM values above `9999.99` are rejected because `personal_records.best_e1rm` is `numeric(6,2)`; the enclosing transaction rolls back the set and PR changes together.
- Candidate records are ordered by highest e1RM, then newest `clientTs`, then stable `sessionId`/set-index tie-breakers. A new record stores the source session and set `clientTs` as `achievedAt`.
- Existing PR rows are locked before recomputation. First-writer races use insert-if-absent; a losing transaction locks and recomputes again so a lower candidate cannot overwrite a higher one.
- No schema migration or progress route is introduced. The existing RLS, `(userId, exerciseId)` natural key, and `numeric(6,2)` storage are sufficient for this slice.

## Implementation Tasks

- [x] Define e1RM input/output types and table-driven edge cases.
- [x] Implement progression calculation and PR comparison/update policy.
- [x] Integrate PR fan-out into the SessionEngine set transaction.
- [x] Add app-role tests for ownership, duplicate PR natural key, edit-down recomputation, and rollback.

## Acceptance Criteria

### Scenario 1: New personal record
- **Given** a committed completed set with valid kg and reps
- **When** progression is materialized
- **Then** the calculated e1RM is deterministic and the user's PR row points to the source session.

### Scenario 2: Non-record and regression
- **Given** an existing higher PR
- **When** a lower valid set is committed
- **Then** the existing PR remains unchanged while the set remains durable.

### Scenario 3: Invalid inputs
- **Given** null/zero/negative/out-of-range values or a foreign exercise/session
- **When** progression runs
- **Then** it follows the documented nullable/zero policy or rejects with validation/authorization error without writing a PR.

### Scenario 4: Atomicity
- **Given** a set mutation whose PR write or enclosing operation fails
- **When** the transaction rolls back
- **Then** neither the set mutation nor a partial PR row remains.

## Automated Verification

```bash
NODE_ENV=test npm run typecheck
npx eslint lib/domain/progression/types.ts \
  lib/domain/progression/progression-engine.ts lib/repositories/workout-repository.ts \
  tests/unit/domain/progression-engine.test.ts tests/integration/repository/workout-repository.test.ts
npx vitest run tests/unit/domain/progression-engine.test.ts
npx vitest run tests/integration/repository/workout-repository.test.ts
npm test
```

Repository integration tests require explicit local Supabase URL/anon values, `MIGRATION_DATABASE_URL` for bounded owner fixture setup, and the tenant-qualified app `DATABASE_URL`; `.env.local` must not be read or modified.

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(progress): implement e1RM and personal records" \
  --body-file docs/tasks/m2/M2-03-progression-engine.md \
  --label "area:backend,area:data,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
