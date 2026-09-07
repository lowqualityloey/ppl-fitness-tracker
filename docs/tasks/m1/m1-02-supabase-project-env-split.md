### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §3, §4.2, §4.6
- **Architectural Decision (ADR)**: `docs/adrs/0002-supabase-auth-over-clerk.md`, `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — every DB and auth task depends on this)
- **Labels**: `area:infra`
- **Depends on**: M1-01

---

## User Story & Context

**As a** developer implementing schema and auth
**I want** a provisioned Supabase project (local via `supabase start`, matching the M0 spike's setup) with the owner and app-role connection strings kept structurally separate
**So that** migrations can never accidentally run through the low-privilege runtime path, and the runtime can never accidentally run through the owner path — the exact confusion the M0 tenancy gate exists to catch.

The M0 spike (`docs/spikes/2026-09-08-drizzle-rls-enforcement.md`) already did this once for the sandbox at `spikes/m0-drizzle-rls/`. This task repeats it for the real app, not the throwaway harness.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- New: `supabase/config.toml` (via `supabase init`), `supabase/migrations/` (empty, ready for M1-03)
- New: `.env.local` (gitignored — already covered by root `.gitignore`), `.env.example` (committed, no real secrets)
- Modify: `PROMPTKIT.md` §2 — correct "PostgreSQL 16" to "PostgreSQL 17.6" per the M0 spike finding (this was missed in the earlier STATE.md-only fix)

### Non-Negotiable Invariants
- [ ] **Two distinct connection strings, never interchanged**: `DATABASE_URL` (or `SUPABASE_DB_URL`) for the app role, `MIGRATION_DATABASE_URL` (owner) available to CI/migration tooling only — per ADR-0003 "Migrations and seeds run under the owner role via a separate `MIGRATION_DATABASE_URL`, available to CI only"
- [ ] `service_role` key never appears in any file reachable by client-side code or committed to git
- [ ] `.env.local` is gitignored (verify against existing `.gitignore`, do not assume)
- [ ] Local pooler enabled (`[db.pooler] enabled = true`) so M1-08's tenancy gate can run against it, matching the M0 spike setup

### Out of Scope
- Creating the `app_authenticated` role itself (M1-04) — this task only provisions the project and env split
- Any table or migration content (M1-03)
- Production/hosted Supabase project — local only for M1; hosted project provisioning is a deploy-time (M4) concern unless blocked

---

## Implementation Tasks
- [ ] 1. Run `supabase init` at repo root (or a `supabase/` subdirectory consistent with `PROMPTKIT.md` §4's "single Next.js app at the repository root")
- [ ] 2. Enable the local pooler in `supabase/config.toml` (`[db.pooler] enabled = true`), matching the spike's config
- [ ] 3. Start the stack, excluding services not needed for M1 (mirror the spike's `-x realtime,storage-api,imgproxy,...` flag, but re-add `postgrest`/`studio` if useful for manual inspection during development — unlike the throwaway spike, this is the real project)
- [ ] 4. Write `.env.example` documenting `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (placeholder values only)
- [ ] 5. Write `.env.local` with real local-stack values, confirm it's gitignored
- [ ] 6. Correct `PROMPTKIT.md` §2 Postgres version

---

## Acceptance Criteria

### Scenario 1: Happy path — stack starts, env split is real
- **Given** `supabase start` has been run
- **When** a script connects with `MIGRATION_DATABASE_URL` and runs `SHOW is_superuser` or checks `current_user`
- **Then** it reports the owner role (`postgres`), never `app_authenticated`

### Scenario 2: Secret hygiene
- **Given** the repository as committed
- **When** `git grep -n "SUPABASE_SERVICE_ROLE_KEY\s*=" -- ':!.env.example'` is run (or equivalent secret scan)
- **Then** no committed file contains a real service-role key value — only `.env.example` with a placeholder

### Scenario 3: Negative — app role does not yet exist (expected at this stage)
- **Given** this task completes before M1-04
- **When** a connection attempt is made using the `app_authenticated` role name
- **Then** it fails to authenticate — verified 2026-09-08: Postgres's auth handshake checks the password *before* revealing whether the role exists, as a role-enumeration defense, so the actual error is `password authentication failed for user "app_authenticated"`, not "role does not exist" as originally assumed here. Confirmed via `SELECT rolname FROM pg_roles WHERE rolname = 'app_authenticated'` returning zero rows on the owner connection — the role genuinely isn't there; the error message is just not the literal string this task originally expected.

---

## Automated Verification Command
```bash
supabase status -o env  # confirms stack is up and prints connection info
```
