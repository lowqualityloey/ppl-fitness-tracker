# feat(progress): implement e1RM and personal records

### Metadata
- **Local Task**: `M2-03`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0003-rls-defense-in-depth.md`, `docs/adrs/0005-design-tokens-and-set-logging.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `area:data`, `type:feature`, `type:test`
- **Kanban Status**: `To Do`

## User Story & Context

**As a** lifter logging weight and reps  
**I want** a reliable e1RM trend and personal-record materialization  
**So that progress reflects committed training data rather than fabricated dashboard metrics.

## Technical Scope & Invariants

- Define the e1RM formula and rounding/null/zero policy in a pure domain module.
- Materialize `personal_records` by `(userId, exerciseId)` inside the same transaction as the source set mutation.
- Scope all reads/writes by verified user and enforce exercise/session ownership.
- Store kg canonically; display-unit conversion is outside this task.

### Out of scope

Sync conflict resolution, device ids, import, chart UI, SMTP, and changing the existing schema without an Expand-Contract plan.

## Implementation Tasks

- [ ] Define e1RM input/output types and table-driven edge cases.
- [ ] Implement progression calculation and PR comparison/update policy.
- [ ] Integrate PR fan-out into the SessionEngine set transaction.
- [ ] Add app-role tests for ownership, duplicate PR natural key, and rollback.

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
- **Given** a set mutation whose PR write fails
- **When** the transaction rolls back
- **Then** neither the set mutation nor a partial PR row remains.

## Automated Verification

```bash
npm run typecheck
npm test
npx vitest run tests/unit/domain tests/integration/repository
```

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(progress): implement e1RM and personal records" \
  --body-file docs/tasks/m2/M2-03-progression-engine.md \
  --label "area:backend,area:data,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
