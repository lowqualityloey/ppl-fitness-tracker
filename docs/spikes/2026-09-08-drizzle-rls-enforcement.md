# Technical Spike: does Postgres RLS enforce through Drizzle?

- **Author**: Owner + Kiro
- **Status**: Completed
- **Created**: 2026-09-08
- **Timebox**: 1 day. Actual: roughly half a day.
- **Stop-Loss Condition**: if a cross-user read could not be made to return zero rows through the Drizzle client within the timebox, terminate and reopen ADR-0003 rather than keep tuning.
- **Milestone**: M0. **Gates M1.**
- **Sandbox**: `spikes/m0-drizzle-rls/` (throwaway, see its `README.md`)

---

## 1. Core Spike Question & Sharpest Risk

### Core question

ADR-0003 commits to two authorization layers: application-level `userId` scoping
as the authoritative control, and Postgres Row Level Security as a backstop.
Layer 2 only exists if it actually fires. So:

> When queries are issued through Drizzle as a non-owner `NOBYPASSRLS` role,
> with verified JWT claims seeded per transaction, does Postgres refuse to return
> another user's rows — and can a test prove it in a way that would fail if the
> control were removed?

### The sharpest risk

Not "does RLS work". RLS works. The risk is that **it silently does not apply on
the path this app actually uses**, for one of four reasons:

1. Drizzle connects with a role that bypasses RLS, so nothing is enforced.
2. The tenancy test connects as the owner and passes vacuously while production
   is open (spec §4.2, gate-defeating case 1).
3. A table added later has no policy, and no existing test covers a table that
   does not exist yet (gate-defeating case 2).
4. `set_config` writes claims at session scope instead of transaction scope, so
   a pooled connection hands one user's identity to the next request
   (ADR-0003 invariant 4, FMEA row 2).

Items 2 and 4 are the dangerous ones, because both produce a **green test suite
over a broken control**.

---

## 2. Candidate Approaches

This is a verification spike, not a library bake-off, so the candidates are
authorization designs rather than dependencies. No new dependency is under
consideration and no innovation token is being spent — Drizzle, Supabase and
Postgres are all already committed by ADR-0001…0003.

- **Candidate A (boring baseline)**: application-layer `userId` scoping only. Every
  repository method takes `userId`; no database-side enforcement.
- **Candidate B**: RLS only. Drop app-layer scoping and let the database be the
  single source of truth.
- **Candidate C (ADR-0003, under test)**: both. App scoping authoritative, RLS as
  a backstop under a non-owner role.

---

## 3. Multi-Vector Comparative Matrix

| Dimension | A: app scoping only | B: RLS only | C: both (ADR-0003) |
| :--- | :--- | :--- | :--- |
| **Blast radius of one forgotten `WHERE`** | Full cross-tenant read | None | None |
| **Blast radius of one forgotten policy** | None | Full cross-tenant read | Caught by app scoping + drift test |
| **Per-request latency cost** (measured, §4) | 0 ms (baseline) | ~1.3 ms p50 | ~1.3 ms p50 |
| **Round trips per request** | 1 | 4 (BEGIN, set_config, query, COMMIT) | 4 |
| **Transaction-pooler safety** | Not applicable | Depends entirely on `is_local` | Depends on `is_local`; app scoping still holds if it regresses |
| **Testability** | Unit-testable, no DB needed | Needs a non-owner role in CI | Needs a non-owner role in CI |
| **Failure mode if misconfigured** | Silent leak | Silent leak | Requires *two independent* mistakes to leak |
| **New dependencies / licence risk** | None | None | None |
| **Ongoing tax** | Code review discipline | Migration discipline | Both, plus a drift test |

Candidate C costs about 1.3 ms and one extra rule to remember per table. It buys
the property that no single omission leaks data. For a personal fitness tracker
that is arguably more rigour than the data warrants, but the cost is small,
already decided, and the same reasoning transfers if the project ever grows.

---

## 4. Empirical PoC & Benchmark Results

### Setup

| Component | Version |
| :--- | :--- |
| Supabase CLI | 2.117.0 (local stack) |
| PostgreSQL | **17.6** — note, not 16 |
| Drizzle ORM | 0.45.2 |
| node-postgres | 8.23.0 |
| Vitest | 5.0.0 |
| Node | 24.20.0 |
| Pooler | supavisor, transaction mode, port 54329 |

Two users are created through the **GoTrue Admin API**, then signed in, and the
claims used in every test are the **decoded payload of a token GoTrue actually
issued**. Hand-writing a claims object would have reduced the spike to checking
that our fixture matches our own policy.

Three connection strings, and the difference between them is the whole design:

- `postgres` — owner, `BYPASSRLS`. Migrations and seeding only.
- `app_authenticated` — non-owner, `NOBYPASSRLS`, owns nothing. Every isolation
  assertion runs here.
- `app_authenticated` through supavisor — same role, real transaction pooling.

### Results

```text
$ npm test
 Test Files  5 passed (5)
      Tests  32 passed (32)
   Duration  5.70s
```

| Assertion | Test file | Result |
| :--- | :--- | :--- |
| `M0-01` role is `NOBYPASSRLS`, `NOSUPERUSER`, inherits no bypass, owns no table | `01-non-vacuity` | pass |
| `M0-02` `ENABLE` + `FORCE ROW LEVEL SECURITY` on both tables, 4 discrete policies each | `03-drift` | pass |
| `M0-03` cross-user read, update, delete return zero; cross-user insert rejected `42501` | `02-isolation` | pass |
| `M0-04` `current_user = 'app_authenticated'` inside the harness | `01-non-vacuity` | pass |
| `M0-05` `pg_tables` drift check flags an unprotected table | `03-drift` | pass |
| `M0-06` `set_config(..., true)` does not leak across a size-1 pool | `04-claims-leak` | pass |

### Sharpest risk verification

**The negative control is the load-bearing part.** `withUserLeaky()` is identical
to `withUser()` except `is_local = false`. Run first, on a pool pinned to
`max: 1`, asserting both calls landed on the same `pg_backend_pid()`:

- With `is_local = false`: the following claim-less query on that connection
  reads user B's row. The leak ADR-0003 warns about is real and reproducible.
- With `is_local = true`: the same sequence returns zero rows, and the GUC reads
  back empty. Also holds after a rolled-back transaction, and when a B
  transaction is immediately followed by an A transaction.

Through supavisor in transaction mode: 40 interleaved concurrent transactions
alternating between the two users each saw exactly their own row, and 20
subsequent claim-less checkouts saw nothing.

### Can the suite fail?

A green suite proves the suite passes, not that the control works. So each
control was removed and the suite re-run. (This required a fix to the harness:
the idempotent DDL was silently *repairing* every mutation before assertions ran.)

```text
$ npm run mutate
CAUGHT   RLS disabled on session_sets                    exit=1  Tests  11 failed | 4 passed (15)
CAUGHT   SELECT policy widened to USING (true)           exit=1  Tests   6 failed | 5 passed (11)
CAUGHT   four discrete policies collapsed into one FOR ALL exit=1  Tests   1 failed | 3 passed (4)
--- control restored ---                                 exit=0  Tests  32 passed (32)
```

### Cost of ADR-0003

Closes the "per-request transaction cost is unmeasured" risk in `STATE.md` §5.
2000 iterations after 200 warm-up, single local container, no concurrent load —
indicative bounds, not a production SLA.

| Path | bare `SELECT 1` | app-scoped `SELECT` | `withUser()` wrapped | overhead vs app-scoped |
| :--- | :--- | :--- | :--- | :--- |
| Direct (54322) | 0.386 ms p50 | 0.491 ms p50 | 1.785 ms p50 | **+1.29 ms p50 / +1.87 ms p95** |
| supavisor (54329) | 0.615 ms p50 | 0.784 ms p50 | 2.765 ms p50 | **+1.98 ms p50 / +2.35 ms p95** |

Four round trips instead of one, and it scales with round-trip time — so the
figure will be worse from a serverless region that is not adjacent to the
database. Against the spec §2 SLA budget this is affordable, but it is now a
known line item rather than an unknown.

---

## 5. Findings the spec did not anticipate

Five, in descending order of how much they change M1.

### 5.1 `auth.uid()` prefers a GUC that `withUser()` never sets

The stock definition, read off the running image:

```sql
select coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),      -- legacy, singular
  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
)::uuid
```

The **legacy singular GUC is checked first**. `withUser()` as written in spec
§4.2 only sets `request.jwt.claims`, and relies on the fallback. Demonstrated
consequence: with `request.jwt.claim.sub` set to B at session scope, a
transaction that correctly sets A's claims transaction-locally **reads B's row**.

Nothing in the planned stack sets that GUC — PostgREST is the usual source and it
connects as a different role on a separate pool — so exposure today is low. It is
still a one-line fix and the failure is silent, so it should be closed rather
than noted:

```ts
await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', '', true)`);
await tx.execute(sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
```

Both the vulnerable and the hardened behaviour are asserted in
`tests/04-claims-leak.test.ts`.

### 5.2 `GRANT USAGE ON SCHEMA auth` silently does nothing

Issued as `postgres`, the grant **returns success and has no effect** —
`has_schema_privilege('app_authenticated','auth','USAGE')` is still false
afterwards. The schema is owned by `supabase_admin` and the grant is discarded
without an error.

A migration can therefore claim a privilege it did not obtain. Any grant against
a Supabase-managed schema needs an assertion, not an exit code.

### 5.3 The app role does not need the `auth` schema at all

Following from 5.2: policies calling `auth.uid()` evaluate correctly even though
the querying role has no `USAGE` on `auth`. Verified both directions — one row
with claims set, zero without — while a direct `SELECT auth.uid()` from that role
raises `42501`.

This is *better* than the spec assumed. `app_authenticated` gets no reach into
the auth schema whatsoever. The constraint it imposes: application code must
never call `auth.uid()` directly and must take the user id from `requireUser()`.
Diagnostics have to read the GUC instead.

### 5.4 `FORCE ROW LEVEL SECURITY` does not constrain the owner here

`FORCE` removes the owner's exemption but does not touch the `BYPASSRLS`
*attribute*, and Supabase ships `postgres` with `rolbypassrls = true`. Confirmed:
the owner connection reads every row from a table that has both `ENABLE` and
`FORCE` set.

Two independent escape hatches, and `FORCE` only closes one. This is exactly why
the `current_user` assertion in the tenancy gate is mandatory rather than
decorative.

### 5.5 `ALTER ROLE` on the app role is refused after creation

`postgres` may `CREATE ROLE ... NOBYPASSRLS NOSUPERUSER` but is refused when it
later tries to `ALTER` the same attributes — supautils raises `42501`
("Only roles with the SUPERUSER attribute may alter roles with the SUPERUSER
attribute"). So role attributes cannot be re-forced by an idempotent migration.

Handled by asserting attributes in the test suite instead, which is the better
arrangement anyway: a drifted role fails a merge gate rather than being silently
repaired.

### Minor

- **Postgres is 17.6, not 16.** `PROMPTKIT.md` §2 and the spec both say 16.
- **`current_setting` reads back `''`, not NULL**, once a transaction-local value
  goes out of scope, so `''::jsonb` raises `22P02`. This is why Supabase's own
  `auth.uid()` wraps it in `nullif`. Any diagnostic must do the same.
- **Drizzle wraps driver errors** in `DrizzleQueryError`; the SQLSTATE lives on
  `.cause.code`. Tests asserting on `42501` must reach through `cause`.
- **RLS is a filter on top of `GRANT`, not a substitute.** Without table grants
  the app role gets "permission denied" rather than zero rows — a different, and
  misleadingly reassuring, failure.

---

## 6. Trade-Off Analysis

### What we gain

- ADR-0003 is confirmed implementable as specified, on the real stack, through
  the ORM the app will use. M1 can commit a schema.
- The `is_local` invariant is no longer a claim. The failure mode is reproduced,
  and the mitigation is shown to close it.
- Both gate-defeating cases from spec §4.2 have working detectors, and all three
  controls are shown to fail loudly when removed.
- The pooling question is answered under a real transaction pooler, not just a
  size-1 client pool.
- The cost of the decision has a number.
- `handle_new_user` is verified as a side effect: the trigger fires on GoTrue
  user creation and both profiles exist before the seed proceeds.

### What we pay

- ~1.3 ms p50 per request direct, ~2.0 ms through the pooler, and it grows with
  round-trip time.
- Two extra rules per table forever: four policies, and `ENABLE` + `FORCE`.
- Migrations need a second connection string as the owner role, and CI needs
  both.
- One extra `set_config` round trip from finding 5.1.

### Residual risk not covered

- **Local stack, not a hosted project.** Roles and `auth.uid()` came from the
  stock image, so behaviour should match, but findings 5.2 and 5.5 are
  supautils-mediated and could differ on a hosted plan. Re-assert during M1
  against a real project.
- **No load test.** Concurrency here was 40 interleaved transactions on one
  container. Pool exhaustion under sustained load stays an M4 item.
- **Password grant, not magic link.** Used to obtain real tokens cheaply. The
  `sub` claim is identical either way, so this does not affect the conclusion,
  but the magic-link flow itself is still unproven.
- **Two tables, not the full schema.** The pattern is proven; applying it to
  every table in M1 is what the drift test is for.

---

## 7. Final Recommendation & ADR Handoff

**Verdict: adopt Candidate C. ADR-0003 stands as written, with one amendment.**

M0 exit criteria are met: all six assertions pass, they are shown capable of
failing, and both gate-defeating cases have detectors. **M1 is unblocked.**

The amendment is finding 5.1 — `withUser()` must also blank
`request.jwt.claim.sub` transaction-locally. This does not change the decision,
so it is an amendment to ADR-0003 rather than a new ADR.

### What M1 must adopt from this sandbox

- [ ] `withUserHardened()` from `src/db.ts` becomes the *only* `withUser`. The
      two-argument form is a defect.
- [ ] Do **not** grant the app role anything on the `auth` schema. Application
      code takes the user id from `requireUser()`, never `auth.uid()`.
- [ ] Port the drift test verbatim, and extend it to flag RLS-enabled-but-zero-policy
      tables and any `FOR ALL` policy — not just `rowsecurity = false`.
- [ ] Keep `current_user = 'app_authenticated'` as the first statement of the
      tenancy gate. Finding 5.4 is why.
- [ ] Keep a negative control in the suite. A mitigation whose failure mode is
      never exercised decays into a comment.
- [ ] Assert role attributes in tests; migrations cannot enforce them (5.5).
- [ ] Assert the result of any `GRANT` against a Supabase-managed schema (5.2).
- [ ] Run the tenancy gate against the pooler DSN too, not only a direct
      connection.

### Follow-up actions

- [x] Spike written up here
- [ ] Amend ADR-0003 with finding 5.1 and the least-privilege consequence of 5.3
- [ ] Correct the Postgres version in `PROMPTKIT.md` §2 and spec §3
- [ ] `pk:tasks` against M1
- [ ] Delete `spikes/m0-drizzle-rls/` once M1's integration suite covers the same
      ground. It is a sandbox, not a module.
