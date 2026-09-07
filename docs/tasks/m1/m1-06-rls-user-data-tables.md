### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.1, §4.2
- **Architectural Decision (ADR)**: `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker)
- **Labels**: `area:data`
- **Depends on**: M1-04

---

## User Story & Context

**As a** developer protecting per-user training data
**I want** RLS on `profiles`, `workout_sessions`, `session_sets`, `session_tasks`, `personal_records`, `sync_mutations`, and `import_batches` — the six tables where every row belongs to exactly one user, no exceptions
**So that** a forgotten `WHERE userId = ...` in application code (the scenario ADR-0003 names as the entire value proposition of Layer 2) is contained by the database, not shipped.

This is the core of what M0 verified. The policy shape (`user_id = (SELECT auth.uid())` on all four commands, no `owner_user_id IS NULL` exception) is simpler than M1-05's content-table policies and matches the spike's `session_sets`/`profiles` policies almost exactly.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Database Tables / Migrations**: `profiles`, `workout_sessions`, `session_sets`, `session_tasks`, `personal_records`, `sync_mutations`, `import_batches` — `ENABLE`/`FORCE ROW LEVEL SECURITY` + four policies each
- **Services / Handlers**: none yet

### Non-Negotiable Invariants
- [ ] **`ENABLE` + `FORCE ROW LEVEL SECURITY`** on all seven tables
- [ ] **Four discrete policies per table, never `FOR ALL`** — this is the exact rule the M0 mutation check proved the drift detector catches; violating it here would be caught in M1-07, but the goal is to not violate it in the first place
- [ ] Policy predicate is `user_id = (SELECT auth.uid())` (or `id = (SELECT auth.uid())` for `profiles`, where the primary key *is* the user id) on every one of the four commands
- [ ] `profiles` UPDATE policy must not allow a user to change their own `id` — add `WITH CHECK (id = (SELECT auth.uid()))` matching the existing row, not just `USING`
- [ ] `sync_mutations` and `import_batches` still get all four policies even though the application's actual write pattern may only ever INSERT — per `PROMPTKIT.md` §6, "never `FOR ALL`" is not conditional on expected usage patterns
- [ ] `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO app_authenticated` for every table — RLS without the grant produces `permission denied`, a different failure than `0` rows

### Out of Scope
- Content-table RLS (`exercises`, `routine_days`, `routine_exercises` — M1-05)
- The drift test (M1-07) and tenancy gate (M1-08) that verify this shape — this task makes the policies correct, those tasks make correctness a merge gate
- Cross-table consistency (e.g., `session_sets.user_id` matching `workout_sessions.user_id` for the same session) — a data-integrity concern for M2's `SessionEngine`, not an RLS concern

---

## Implementation Tasks
- [ ] 1. `ENABLE`/`FORCE ROW LEVEL SECURITY` on all seven tables
- [ ] 2. Write four policies for `profiles` (SELECT/INSERT/UPDATE/DELETE, keyed on `id`)
- [ ] 3. Write four policies for `workout_sessions` (keyed on `user_id`)
- [ ] 4. Write four policies for `session_sets` — port directly from `spikes/m0-drizzle-rls/sql/001-setup.sql`, already verified by the spike
- [ ] 5. Write four policies each for `session_tasks`, `personal_records`, `sync_mutations`, `import_batches`
- [ ] 6. Apply `GRANT`s for all seven tables
- [ ] 7. Write isolation tests per table: seed two users, assert cross-user SELECT/UPDATE/DELETE return zero rows and cross-user INSERT is rejected `42501` — mirroring `spikes/m0-drizzle-rls/tests/02-isolation.test.ts` but against the real schema

---

## Acceptance Criteria

### Scenario 1: Happy path — own data fully accessible
- **Given** user A has rows in all seven tables
- **When** user A queries, updates, and deletes their own rows through Drizzle as `app_authenticated`
- **Then** every operation succeeds and behaves as an unscoped query would (RLS is invisible to correct usage)

### Scenario 2: Negative — cross-user read, update, delete all return zero
- **Given** user A and user B each have a row in `workout_sessions` (or any of the seven tables)
- **When** authenticated as A, a query filters explicitly by B's id, or fetches B's row by primary key with no filter at all
- **Then** the result is zero rows for SELECT, and zero rows affected for UPDATE/DELETE — both the filtered and unfiltered cases must be tested, since an unfiltered fetch-by-PK is the shape of bug RLS exists to catch

### Scenario 3: Negative — cross-user insert is rejected, not silently redirected
- **Given** user A is authenticated
- **When** an INSERT attempts `user_id = <B's id>`
- **Then** it raises `42501` (via Drizzle's `DrizzleQueryError`, SQLSTATE on `.cause.code`) — never silently written under A's own id instead, which would corrupt data rather than protect it

### Scenario 4: `profiles` cannot be re-keyed
- **Given** user A's `profiles` row
- **When** A attempts `UPDATE profiles SET id = <B's id> WHERE id = A.id`
- **Then** the `WITH CHECK` clause rejects it

---

## Automated Verification Command
```bash
npx vitest run tests/integration/rls-user-data-tables.test.ts
```
