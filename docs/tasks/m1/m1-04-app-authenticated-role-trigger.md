### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2, §4.3 (trigger)
- **Architectural Decision (ADR)**: `docs/adrs/0003-rls-defense-in-depth.md` (incl. Amendment A1)
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — everything RLS-related depends on this role existing correctly)
- **Labels**: `area:auth`
- **Depends on**: M1-03

---

## User Story & Context

**As a** developer implementing Layer 2 authorization
**I want** the `app_authenticated` role and `handle_new_user` trigger ported from the verified M0 spike SQL (`spikes/m0-drizzle-rls/sql/001-setup.sql`), not re-derived from the spec's abbreviated sketch
**So that** the five things the spike found the spec got wrong (Amendment A1.1–A1.5) are correct on the first attempt instead of being rediscovered.

This is the single highest-leverage task in M1: every RLS policy, the tenancy gate, and the repository helper all depend on this role's attributes and grants being exactly right.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Database Tables / Migrations**: new migration creating the role and trigger — port from `spikes/m0-drizzle-rls/sql/001-setup.sql` sections 1 and 5
- **Services / Handlers**: none yet (M1-11 consumes this)

### Non-Negotiable Invariants
- [ ] **Role created once, never `ALTER`ed for attributes.** `CREATE ROLE app_authenticated LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`, guarded by `IF NOT EXISTS`. Per Amendment A1.4, a subsequent `ALTER ROLE ... NOBYPASSRLS` on a Supabase project raises `42501` — the migration must not attempt it, and the test in this issue is what catches drift instead
- [ ] **No `GRANT ... ON SCHEMA auth`.** Per Amendment A1.2, this grant silently no-ops on Supabase-managed schemas and buys nothing — policies resolve `auth.uid()` regardless of the querying role's schema privileges. Do not add it, and do not "fix" a missing grant later without first checking `has_schema_privilege()` actually changed
- [ ] **`handle_new_user` is `SECURITY DEFINER` with `SET search_path = ''`** — pinned search path defeats search-path hijacking on a `SECURITY DEFINER` function, exactly as in the spike SQL
- [ ] **Role owns no table.** Verify with `pg_tables.tableowner`, not just by inspection
- [ ] Table-level `GRANT SELECT/INSERT/UPDATE/DELETE` for `app_authenticated` is added per-table in M1-05/M1-06, not here — this task only creates the role and the trigger, matching the spike's separation of concerns

### Out of Scope
- RLS policies themselves (M1-05, M1-06)
- `withUserHardened()` / the two-`set_config` pattern (M1-11) — though this task's tests confirm the role can be the target of that pattern
- Testing the trigger against a real magic-link signup (that's M1-13's job, end to end); this task tests it against a directly created `auth.users` row via the admin API, same as the spike did

---

## Implementation Tasks
- [ ] 1. Port the role-creation block from `spikes/m0-drizzle-rls/sql/001-setup.sql` §1 into a real migration, adjusting the password to a securely generated secret stored via env, not hardcoded (the spike's `'spike_only_not_a_secret'` is explicitly a throwaway — do not carry that value forward)
- [ ] 2. Grant `USAGE ON SCHEMA public` only — no `auth` schema grant (A1.2)
- [ ] 3. Port `handle_new_user()` and the `on_auth_user_created` trigger from the spike SQL §5, targeting the real `profiles` table from M1-03
- [ ] 4. Write the role-attribute assertion test (ported from `spikes/m0-drizzle-rls/tests/01-non-vacuity.test.ts`): `NOBYPASSRLS`, `NOSUPERUSER`, no inherited bypass, owns no `public` table
- [ ] 5. Write the trigger test: create a user via the GoTrue admin API, assert exactly one `profiles` row exists with matching `id` and `email`
- [ ] 6. Write the "auth schema is unreachable" test: connecting as `app_authenticated` and calling `SELECT auth.uid()` directly raises `42501`

---

## Acceptance Criteria

### Scenario 1: Happy path — role attributes correct
- **Given** the migration has been applied
- **When** `SELECT rolname, rolbypassrls, rolsuper, rolcanlogin FROM pg_roles WHERE rolname = 'app_authenticated'` is run as the owner
- **Then** it returns exactly one row: `rolbypassrls = false, rolsuper = false, rolcanlogin = true`

### Scenario 2: Happy path — trigger fires on signup
- **Given** the trigger is installed
- **When** a new user is created via the GoTrue Admin API
- **Then** exactly one `profiles` row exists with `id` matching the new user's UUID, created within the same transaction (no polling, no eventual consistency)

### Scenario 3: Negative — app role has no reach into `auth`
- **Given** the role has been created with only `public` schema usage
- **When** a connection as `app_authenticated` runs `SELECT auth.uid()` directly (not through a policy)
- **Then** it fails with `42501 permission denied for schema auth` — this is the correct, intended failure per Amendment A1.2, not a bug to fix

### Scenario 4: Negative — attribute drift is caught, not silently repaired
- **Given** someone manually runs `ALTER ROLE app_authenticated BYPASSRLS` against the local database (simulating drift or a misconfigured hosted project)
- **When** the role-attribute assertion test (Task 4) is run
- **Then** it fails loudly, rather than a migration silently "fixing" it — proving drift surfaces as a merge-gate failure

---

## Automated Verification Command
```bash
npx vitest run tests/integration/app-role.test.ts tests/integration/handle-new-user.test.ts
```
