# Architectural Decision Record (ADR): Row-Level Security as Defense in Depth Behind Drizzle

- **Status**: Accepted — **confirmed and amended 2026-09-08** by the M0 spike (see Amendment A1)
- **Deciders**: Repository owner, Kiro
- **Date**: 2026-09-08
- **Technical Story**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2, §7 decision 3

---

## Context and Problem Statement

Drizzle opens its own Postgres connection. If that connection authenticates as the role that owns the tables — the default when you paste a Supabase connection string — then Row Level Security does not apply. RLS is enforced per-role, per-statement: a policy only bites for a role that is not the table owner, has no `BYPASSRLS` attribute, and is not a superuser. The owner role satisfies none of those, so [Prisma and Drizzle bypass Supabase RLS entirely on every query](https://dev.to/emil_alander_7c/does-prisma-respect-supabase-rls-no-heres-why-k53).

This produces a specific and dangerous outcome: you write policies, review them, see them listed in the dashboard, and they never execute. The protection appears present and does nothing.

That failure mode has direct precedent in this repository. `SECURITY_IMPROVEMENTS.md` documents an "Authorization System" with an `AuthManager` class and access control. In the shipped code, `legs-day-workout/app.js` enables guest mode on the line immediately before testing for it, making the deny branch unreachable; a second, richer `AuthManager` in `auth.js` is never loaded by any script tag; and `canAccessPhase()` returns `true` unconditionally. Three layers of documented security, zero enforcement. Rebuilding that pattern at the database layer, with more ceremony, would be worse — not better — than having no policies at all, because the documentation would be more convincing.

So the question is not "should we use RLS" but "if we use it, how do we know it is on".

---

## Decision Drivers

- Application code must be the primary control; it is where the authorization intent is legible
- Any second layer must be *verifiable*, not merely present
- Drizzle's type inference and migration tooling are why Drizzle is in the stack; losing them is expensive
- One maintainer, so per-request overhead must be justified rather than assumed free
- Guardrail from `PROMPTKIT.md`: database invariants live in the schema, not only in application code

---

## Considered Options

1. **Application-layer scoping only** — every query filtered by a server-derived `userId`; no RLS
2. **Application-layer scoping + RLS under a dedicated non-owner role** — two layers
3. **RLS only, via the Supabase JS client and PostgREST** — drop Drizzle from the request path
4. **RLS policies written but Drizzle left connecting as owner** — the accidental default

---

## Decision Outcome

**Chosen Option: Option 2 (both layers).**

Option 4 is what happens if nobody thinks about this, and it is the worst outcome on the list — all of the cost of writing policies, none of the protection, plus a false sense of security. Naming it explicitly here so that it is a rejected option rather than an accident waiting in a future migration.

Option 1 is genuinely defensible and was seriously considered. The property Option 2 buys over it is narrow but real: **it constrains bugs that have not been written yet.** Layer 1 protects against the queries that exist today, all of which are being written carefully right now. Layer 2 protects against the query somebody adds in eight months — a new endpoint, a debug route, an analytics job, a hastily-added feature — where the `userId` filter is forgotten. In that scenario Layer 1 has already failed by construction, and Layer 2 is the only thing standing between a forgotten `WHERE` clause and someone else's training log. That is the entire value proposition, and it is worth stating in exactly those terms rather than as "defense in depth", which is a slogan and not an argument.

Option 3 was rejected because forfeiting Drizzle's type inference and migration story is a larger loss than the problem it solves.

**Implementation.** Drizzle connects as `app_authenticated`: created `NOBYPASSRLS`, granted only `SELECT/INSERT/UPDATE/DELETE` on application tables, and deliberately not the owner of any of them. Each request opens a transaction seeding the verified JWT claims:

```ts
await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
```

The third argument matters more than it looks. `true` is `is_local`, scoping the setting to the current transaction. With `false` the setting persists on the *connection* — and under PgBouncer transaction-mode pooling, that connection is handed to whichever request comes next. The result would be one user's identity silently applied to another user's queries: a cross-tenant read with no error and no log line. This is recorded as its own FMEA row (probability Low, severity Critical) with a lint rule banning a literal `false` or a missing third argument.

Migrations and seeds run under the owner role via a separate `MIGRATION_DATABASE_URL` available only to CI.

### The verification gate, and its two known holes

`tests/integration/tenancy.test.ts` seeds two users, authenticates as A, and asserts every repository read returns zero rows for B's ids — through the same Drizzle client and role the application uses. Two ways that test passes while production is open were identified and are covered explicitly:

1. **Wrong role in the harness.** A test connecting via `MIGRATION_DATABASE_URL` passes vacuously, because the owner bypasses RLS. The test therefore asserts `current_user = 'app_authenticated'` as its first statement, before any data assertion.
2. **A table added later with no policy.** RLS is per-table, not per-database. A future migration creating a table without `ENABLE ROW LEVEL SECURITY` is unprotected, and no existing test would notice. Covered by a schema-drift test querying `pg_tables` and failing if any table in `public` has `rowsecurity = false` — so the gate covers tables nobody has written yet, which is the same population Layer 2 exists to protect.

Both tests are merge gates. Without them this ADR describes ceremony.

### Positive Consequences

- A forgotten `WHERE user_id = ...` in future code is contained by the database rather than shipped
- `FORCE ROW LEVEL SECURITY` means even the owner is subject to policies when acting through the app path
- Policies read `user_id = (SELECT auth.uid())` — short enough to review by eye, thanks to ADR-0002
- The `pg_tables` drift test makes the protection self-extending to new tables
- Satisfies the `PROMPTKIT.md` guardrail on invariants living in the schema

### Negative Consequences & Trade-Offs

- **One transaction per request** rather than a bare query. Raises connection-hold time and pool pressure.
  - *Mitigation*: PgBouncer transaction-mode pooling; `withUser` transactions kept short with no external I/O inside them; pool wait-time metric alarmed. Tracked as an FMEA row (Medium/High) and flagged for load testing in M4 rather than assumed acceptable.
- **A role that must be granted on every new table.** A migration that creates a table and forgets the grant fails closed (queries error) rather than open, which is the correct direction, but it is still a papercut.
  - *Mitigation*: the `pg_tables` drift test catches the RLS half; default privileges via `ALTER DEFAULT PRIVILEGES` handle the grant half.
- **Two places encode the same rule**, so they can drift.
  - *Mitigation*: Layer 1 is the documented control. Layer 2 is deliberately dumber — `user_id = auth.uid()` and nothing else. No business logic in policies, so there is little to drift.
- Local development needs the non-owner role provisioned, adding a setup step.
  - *Mitigation*: role creation lives in the first migration, so `supabase db reset` reproduces it.

---

## Amendment A1 — 2026-09-08, following the M0 spike

The M0 spike (`docs/spikes/2026-09-08-drizzle-rls-enforcement.md`) ran this design
against Supabase Postgres 17.6 through Drizzle 0.45.2. **The decision holds.** All
six exit assertions pass, and each control was removed in turn to confirm the
suite fails without it. Four things this ADR got wrong or left out.

### A1.1 `withUser` as specified above is incomplete

Supabase's `auth.uid()` is not simply a read of `request.jwt.claims`:

```sql
select coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),      -- legacy, singular, checked FIRST
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
```

The legacy singular GUC wins. Demonstrated: with `request.jwt.claim.sub` set to
user B at session scope, a transaction that correctly seeds user A's claims
transaction-locally reads **B's** row. Nothing in the committed stack sets that
GUC, so exposure is low, but the failure is silent and the fix is one statement.
`withUser` therefore becomes:

```ts
await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', '', true)`);
await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
```

The lint rule banning a literal `false` or a missing third argument stands, and now
covers both statements.

### A1.2 The app role gets nothing on the `auth` schema

Policies calling `auth.uid()` evaluate correctly even when the querying role has
no `USAGE` on `auth` — verified in both directions. Stricter than this ADR
assumed, so take it: `app_authenticated` is granted nothing there.

Consequence, and it is a real constraint on M1: **application code must never call
`auth.uid()` directly.** The user id comes from `requireUser()`. Diagnostics that
need the active identity read the GUC, wrapped in `nullif(..., '')` because the
setting reads back as an empty string rather than NULL once a transaction-local
value goes out of scope.

Related trap: `GRANT USAGE ON SCHEMA auth TO app_authenticated` issued as
`postgres` **returns success and does nothing**. Any grant against a
Supabase-managed schema needs an assertion, not an exit code.

### A1.3 `FORCE ROW LEVEL SECURITY` does not do what the Positive Consequences claim

"Even the owner is subject to policies" is wrong. `FORCE` removes the owner's
*ownership* exemption but not the `BYPASSRLS` *attribute*, and Supabase ships
`postgres` with `rolbypassrls = true`. Confirmed: the owner connection reads every
row from a table carrying both `ENABLE` and `FORCE`.

Two independent escape hatches; `FORCE` closes one. This is why the
`current_user = 'app_authenticated'` assertion in the tenancy gate is load-bearing
rather than defensive tidiness.

### A1.4 Role attributes cannot be enforced by migration

`postgres` may `CREATE ROLE ... NOBYPASSRLS NOSUPERUSER` but is refused when it
later `ALTER`s those attributes — supautils raises `42501`. An idempotent migration
cannot re-force them, so **the test suite asserts them instead**. Better anyway: a
drifted role fails a merge gate rather than being silently repaired.

### A1.5 The cost is now measured

The Negative Consequences section flagged per-request transaction cost as
unquantified. Measured, 2000 iterations, single local container:
**+1.29 ms p50 / +1.87 ms p95** direct, **+1.98 ms p50 / +2.35 ms p95** through
supavisor in transaction mode, versus an app-scoped autocommit `SELECT`. Four
round trips instead of one, so it scales with round-trip time and will be worse
from a region distant from the database. Affordable against the spec §2 SLA
budget. Pool exhaustion under sustained load remains an M4 load-test item; the
spike only reached 40 interleaved concurrent transactions.

### Drift test scope, widened

The `pg_tables` check described above tests `rowsecurity = false`. That misses two
states the spike found worth catching, both now required:

- RLS enabled with **zero policies** — denies everything, looks safe, is a broken
  deploy rather than a secure one
- a policy declared `FOR ALL` instead of four discrete commands

---

## Pros and Cons of the Options

### Option 1: Application-layer only
- **Good**, because it is simple, fast, and has no per-request transaction
- **Good**, because authorization intent lives in one readable place
- **Bad**, because a single forgotten filter in any future query is an unbounded data leak
- **Bad**, because it relies on every future contributor being as careful as the person writing the code today

### Option 2: Both layers
- **Good**, because it bounds the blast radius of code that does not exist yet
- **Good**, because it is verifiable, and the verification extends to future tables
- **Bad**, because of per-request transaction overhead and role maintenance
- **Bad**, because it is only as good as the tests that prove it is on — which is precisely how the existing `AuthManager` failed

### Option 3: PostgREST only
- **Good**, because RLS applies natively with no direct-connection caveat
- **Bad**, because it forfeits Drizzle's type safety and migrations

### Option 4: Policies written, Drizzle as owner
- **Bad**, because it is strictly worse than no policies: identical protection, plus documentation asserting otherwise
- **Bad**, because it is the default outcome of pasting a Supabase connection string, so it must be actively prevented

---

## Implementation & Migration Notes

- ~~**M0 spike gates M1.**~~ **Done, 2026-09-08.** Enforcement demonstrated; see
  `docs/spikes/2026-09-08-drizzle-rls-enforcement.md` and Amendment A1 above. M1 is unblocked.
- Migration 1: `CREATE ROLE app_authenticated LOGIN NOBYPASSRLS NOSUPERUSER NOINHERIT`, grants on
  `public` only, `ALTER DEFAULT PRIVILEGES`. Attributes asserted by test, not re-forced by migration (A1.4).
- Every table: `ENABLE` + `FORCE ROW LEVEL SECURITY`, four separate policies (never `FOR ALL`)
- `auth.uid()` wrapped in a scalar subselect so the planner hoists it out of the row loop
- `withUser` blanks `request.jwt.claim.sub` transaction-locally before seeding claims (A1.1)
- CI: two merge-gating tests — the tenancy assertion and the widened drift check — plus a negative
  control proving the `is_local` mitigation still fails when removed. Both run against the pooler DSN
  as well as a direct connection.
- Runtime: post-deploy canary performing one cross-user read and alerting if it returns rows

---

## Links & References

- [Why Prisma and Drizzle bypass Supabase RLS](https://dev.to/emil_alander_7c/does-prisma-respect-supabase-rls-no-heres-why-k53)
- [Drizzle RLS documentation](https://orm.drizzle.team/docs/rls)
- [Supabase RLS policy guidance](https://supabase.com/docs/guides/getting-started/ai-prompts/database-rls-policies)
- ADR-0002 (`0002-supabase-auth-over-clerk.md`) — removed the resolver function these policies would otherwise need
- Prior art in this repo, as a cautionary example: `SECURITY_IMPROVEMENTS.md`, `legs-day-workout/app.js:31-37`, `legs-day-workout/auth.js`
- Spec: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2
- **M0 spike, the evidence behind Amendment A1**: `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`; harness at `spikes/m0-drizzle-rls/`
