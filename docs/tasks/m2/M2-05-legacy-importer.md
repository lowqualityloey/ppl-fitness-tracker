# feat(import): implement idempotent legacy importer

### Metadata
- **Local Task**: `M2-05`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0002-supabase-auth-over-clerk.md`, `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `area:data`, `type:feature`, `type:test`
- **Kanban Status**: `To Do`

## User Story & Context

**As a** returning legacy-app user  
**I want** my recoverable local progress imported once with a transparent report  
**So that** migration preserves real history without inventing data that the legacy app never stored.

## Technical Scope & Invariants

- Parse `pushWorkoutProgress`, `legsWorkoutProgress`, `pullDayProgress`, and documented `userStats` behavior independently with the existing Zod contracts.
- Use a deterministic SHA-256 source fingerprint and `(userId, sourceFingerprint)` uniqueness through `import_batches`.
- Create archived legacy sessions through domain write semantics and report date confidence, counts, warnings, and known loss.
- Never trust a request user id; use verified Auth plus explicit repository user scope.
- Preserve raw keys until the client has acknowledged the import; no irreversible deletion in the server path.

### Out of scope

New legacy data recovery, weight/rep invention, UI archive dialog, SMTP, and schema changes without Expand-Contract.

## Implementation Tasks

- [ ] Implement independent per-key parsers and partial-report aggregation.
- [ ] Implement fingerprint lookup/replay and transactional batch report.
- [ ] Map recoverable sessions/sets and explicit pull-day aggregate loss.
- [ ] Add malformed sibling, date confidence, replay, ownership, rollback, and archive-preservation tests.
- [ ] Expose `/api/import/legacy` only after importer tests are green.

## Acceptance Criteria

### Scenario 1: Recoverable import
- **Given** valid push/legs localStorage payloads for an authenticated user
- **When** the import endpoint is called
- **Then** recoverable session/set data is persisted with `source=legacy_import` and the report counts it accurately.

### Scenario 2: Known loss is explicit
- **Given** pull-day data whose set ids collapsed to `undefined`
- **When** it is imported
- **Then** only recoverable aggregates are represented and the report warns that per-set detail is unavailable.

### Scenario 3: Partial malformed input
- **Given** one malformed known key and other valid keys
- **When** import runs
- **Then** valid siblings are processed, the malformed key is reported, and no unrelated raw value crashes the batch.

### Scenario 4: Fingerprint replay
- **Given** an already imported raw payload
- **When** the same payload is submitted again
- **Then** the original report is returned and no duplicate sessions/sets are created.

## Automated Verification

```bash
npm run typecheck
npm test
npx vitest run tests/unit tests/integration
```

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(import): implement idempotent legacy importer" \
  --body-file docs/tasks/m2/M2-05-legacy-importer.md \
  --label "area:backend,area:data,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
