### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.1, §4.2
- **Architectural Decision (ADR)**: `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker)
- **Labels**: `area:data`
- **Depends on**: M1-04

---

## User Story & Context

**As a** developer protecting shared content
**I want** RLS on `exercises`, `routine_days`, and `routine_exercises` — tables that hold both system-seeded rows (`owner_user_id IS NULL`) and, per spec §2 non-goals, user-level *overrides* of sets/reps/weight
**So that** every user can read the shared exercise library but can only write their own overrides, never another user's.

Split from user-data-table RLS (M1-06) because the policy shape here is different: content tables are readable by *any* authenticated user for system rows, and read/write scoped to the owner only for user-created overrides. That's a distinct enough rule from "every row belongs to exactly one user" that mixing them into one issue would blur two different policy designs.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Database Tables / Migrations**: `exercises`, `routine_days`, `routine_exercises` — `ENABLE`/`FORCE ROW LEVEL SECURITY` + policies
- **Services / Handlers**: none yet

### Non-Negotiable Invariants
- [ ] **`ENABLE` + `FORCE ROW LEVEL SECURITY`** on all three tables (ADR-0003; note `FORCE` does not stop the `postgres` owner role per Amendment A1.3 — this is a hygiene practice, the actual protection is the role's `NOBYPASSRLS` attribute plus the app never connecting as owner at runtime)
- [ ] **Four discrete policies per table, never `FOR ALL`** — SELECT/INSERT/UPDATE/DELETE, matching the spike's finding that a collapsed `FOR ALL` policy is a maintainability regression the drift test (M1-07) must catch
- [ ] **SELECT policy**: `owner_user_id IS NULL OR owner_user_id = (SELECT auth.uid())` — system rows visible to everyone, overrides visible only to their owner
- [ ] **INSERT/UPDATE/DELETE policies**: `owner_user_id = (SELECT auth.uid())` — a user can never create, modify, or delete a system row (`owner_user_id IS NULL`), only their own override rows
- [ ] `auth.uid()` wrapped in a scalar subselect `(SELECT auth.uid())` in every policy so the planner hoists it out of the row loop (ADR-0003, spec §4.2)

### Out of Scope
- RLS for `profiles`, `workout_sessions`, `session_sets`, `session_tasks`, `personal_records`, `sync_mutations`, `import_batches` (M1-06)
- The drift test that verifies this shape holds (M1-07) — this task only makes the policies correct, M1-07 makes "correct" a merge gate
- Seed data itself (M1-09, M1-10) — though this task's tests use minimal fixture rows

---

## Implementation Tasks
- [ ] 1. `ALTER TABLE exercises ENABLE ROW LEVEL SECURITY; ALTER TABLE exercises FORCE ROW LEVEL SECURITY;` (and same for `routine_days`, `routine_exercises`)
- [ ] 2. Write the four policies for `exercises` per the invariants above
- [ ] 3. Decide and implement `routine_days` policy shape — likely simpler, since routine days (push/pull/legs) are always system rows with no user override in v1; document this decision explicitly rather than leaving an unused `owner_user_id`-shaped policy on a table that never has one
- [ ] 4. Write the four policies for `routine_exercises`, following whichever ownership model M1-03 settled on for that join table
- [ ] 5. `GRANT SELECT, INSERT, UPDATE, DELETE` to `app_authenticated` on all three tables (RLS is a filter on top of `GRANT`, not a substitute — per the spike's minor finding)
- [ ] 6. Write isolation tests: two users, one system exercise row, one user-A override row; assert user B can read the system row but not the override, and cannot write to either the system row or user A's override

---

## Acceptance Criteria

### Scenario 1: Happy path — system rows are universally readable
- **Given** a seeded `exercises` row with `owner_user_id IS NULL`
- **When** any authenticated user (A or B) queries `exercises` through Drizzle as `app_authenticated`
- **Then** the row is returned to both

### Scenario 2: Happy path — overrides are owner-scoped
- **Given** user A has created an override row on `exercises` with `owner_user_id = A`
- **When** user B queries `exercises` through Drizzle
- **Then** A's override row is absent from B's result set, and present in A's

### Scenario 3: Negative — cannot write another user's override or a system row
- **Given** user A's override row and a system row both exist
- **When** user B attempts `UPDATE exercises SET name = 'x' WHERE id = <A's override id>` or `WHERE id = <system row id>`
- **Then** both affect zero rows (caught by RLS, not by application logic)

### Scenario 4: Grant check — RLS is not mistaken for a missing grant
- **Given** the table grants have been applied per Task 5
- **When** user A queries their own data
- **Then** the result is an empty/filtered set where appropriate, never a `permission denied for table` error — a `GRANT` failure would look like a different, misleadingly-reassuring bug (per the spike's minor finding) and this scenario exists to distinguish the two failure modes in review

---

## Automated Verification Command
```bash
npx vitest run tests/integration/rls-content-tables.test.ts
```
