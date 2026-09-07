### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.1
- **Architectural Decision (ADR)**: `docs/adrs/0002-supabase-auth-over-clerk.md`, `docs/adrs/0005-design-tokens-and-set-logging.md`
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker)
- **Labels**: `area:data`
- **Depends on**: M1-02

---

## User Story & Context

**As a** developer building the domain layer
**I want** the full Drizzle schema from spec §4.1 committed as an initial migration — `profiles`, `exercises`, `routine_days`, `routine_exercises`, `workout_sessions`, `session_sets`, `session_tasks`, `personal_records`, `sync_mutations`, `import_batches`
**So that** RLS (M1-05/06), seeding (M1-09/10), and contracts (M1-15) all have a real target instead of the abbreviated sketch in the spec.

Spec §4.1 is explicitly "abbreviated to the load-bearing decisions" — `session_tasks`, `personal_records`, and `import_batches` are given as comments, not full definitions, and `routine_days` / `routine_exercises` aren't shown at all despite `workout_sessions.routineDayId` referencing them. This task is where those get fully specified, not just copied.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Database Tables / Migrations**: `db/schema/*.ts` (or equivalent Drizzle schema directory), `supabase/migrations/0001_initial_schema.sql` (or Drizzle-generated equivalent)
- **Services / Handlers**: none yet

### Non-Negotiable Invariants
- [ ] **`profiles.id` IS `auth.users.id`** — no mapping table, `references(() => authUsers.id, { onDelete: 'cascade' })` via raw SQL against the `auth` schema (ADR-0002)
- [ ] **Kilograms canonical**: `weightKg` numeric, no unit column on `session_sets` itself — unit preference lives only on `profiles.preferredUnit` (ADR-0005)
- [ ] **Check constraints in the schema, not only Zod**: `weight_sane` (0–1000) and `reps_sane` (0–1000) on `session_sets`, exactly as specified in §4.1
- [ ] **`one_active_session_per_day` partial unique index** on `workout_sessions` — this is the concurrency control from FMEA row "Two devices start the same workout," not optional polish
- [ ] **`session_client_id` unique index** for idempotent session start
- [ ] Every table gets a nullable `owner_user_id`-style path or is clearly system-owned (`exercises.ownerUserId IS NULL` for seeded rows per §4.1 comment) — decide and document this explicitly for `routine_days`/`routine_exercises` too, since the spec doesn't show them
- [ ] No RLS enabled yet in this task — that's M1-05/06, kept separate so schema correctness and RLS correctness are independently reviewable and independently testable

### Out of Scope
- RLS policies, `ENABLE`/`FORCE ROW LEVEL SECURITY` (M1-05, M1-06)
- The `app_authenticated` role and `handle_new_user` trigger (M1-04)
- Seed data content (M1-09, M1-10)
- Any repository/query code (M1-11)

---

## Implementation Tasks
- [ ] 1. Define `profiles`, `exercises`, `workoutSessions`, `sessionSets` exactly as shown in spec §4.1
- [ ] 2. Design and define `routineDays` (push/pull/legs) and `routineExercises` (join table: day ↔ exercise, with `orderIndex`, `targetSets`, `targetReps` — needed because `workoutSessions.routineDayId` references it and M1-09/10 need somewhere to attach seeded exercises to a day)
- [ ] 3. Fully specify `sessionTasks` (checklist/warm-up/stretch completion — per §4.1 comment: `sessionId`, `taskKey`, `completedAt`, `clientTs`)
- [ ] 4. Fully specify `personalRecords` (`userId`, `exerciseId`, `bestE1rm`, `achievedAt`, `sessionId`)
- [ ] 5. Fully specify `importBatches` (`userId`, `sourceFingerprint` with `UNIQUE(userId, fp)`, `report jsonb`)
- [ ] 6. Fully specify `syncMutations` exactly as shown in §4.1
- [ ] 7. Generate and apply the initial migration against the local Supabase stack via `MIGRATION_DATABASE_URL`
- [ ] 8. Write a smoke test: `drizzle-kit generate` produces no diff against a freshly applied database (schema-in-code matches schema-in-database)

---

## Acceptance Criteria

### Scenario 1: Happy path — full schema applies cleanly
- **Given** a fresh local Supabase database
- **When** the initial migration is applied via `MIGRATION_DATABASE_URL`
- **Then** all 9 tables (`profiles`, `exercises`, `routine_days`, `routine_exercises`, `workout_sessions`, `session_sets`, `session_tasks`, `personal_records`, `sync_mutations`, `import_batches`) exist with the exact column set and constraints from spec §4.1 (and this issue's design for the four tables the spec left abbreviated)

### Scenario 2: Check constraints actually constrain
- **Given** the schema is applied
- **When** an `INSERT` into `session_sets` attempts `weight_kg = 1500` (outside 0–1000)
- **Then** Postgres rejects it with a `check_violation`, proving the invariant lives in the database and not only in application-layer Zod

### Scenario 3: Concurrency guard — duplicate session start
- **Given** `workout_sessions` has the `one_active_session_per_day` partial unique index
- **When** a second `INSERT` is attempted for the same `(userId, routineDayId, localDate)` while the first row's `status = 'in_progress'`
- **Then** the insert fails with a unique-violation, not a silent duplicate row — this is the invariant M2's `SessionEngine` will rely on to implement "device B joins rather than forking" (spec §4.4 step 7)

### Scenario 4: `drizzle-kit` drift check
- **Given** the schema-in-code and the applied migration
- **When** `drizzle-kit generate` is run again immediately after
- **Then** it reports no pending changes

---

## Automated Verification Command
```bash
npx drizzle-kit generate --dry-run  # expect: no changes
npx vitest run tests/integration/schema-constraints.test.ts
```
