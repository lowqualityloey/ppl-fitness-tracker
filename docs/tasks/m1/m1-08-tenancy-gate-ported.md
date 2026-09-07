### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2 (gate-defeating case 1, and the "third hole")
- **Architectural Decision (ADR)**: `docs/adrs/0003-rls-defense-in-depth.md` Amendment A1
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — this is THE merge gate spec §4.2 and ADR-0003 both name explicitly)
- **Labels**: `area:backend`
- **Depends on**: M1-07

---

## User Story & Context

**As a** developer relying on RLS as a backstop
**I want** `tests/integration/tenancy.test.ts` — seeding two real users, authenticating as A, asserting every repository read returns zero rows for B — ported from the M0 spike and widened with the negative control and pooler coverage the spike proved necessary
**So that** the gate that makes ADR-0003's Layer 2 real actually exists in the application repo, not only in the throwaway sandbox.

This is the single test spec §4.2 calls out by name as the thing that makes "both layers ship" more than ceremony. Porting it precisely, including the parts that catch the gate defeating itself, is the point of this task.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Services / Handlers**: `tests/integration/tenancy.test.ts`
- References `withUserHardened()` from M1-11 (if M1-11 isn't merged yet, this task can stub with the two-`set_config` pattern inline and update the import once M1-11 lands)

### Non-Negotiable Invariants
- [ ] **First statement asserts `current_user = 'app_authenticated'`** — per Amendment A1.3, `FORCE ROW LEVEL SECURITY` does not stop the Supabase `postgres` owner role from bypassing RLS, so this assertion is the only thing preventing the gate from passing vacuously if the test harness is accidentally pointed at `MIGRATION_DATABASE_URL`
- [ ] **Real GoTrue users**, not hand-inserted `auth.users` rows — claims used in the test are the decoded payload of a token GoTrue actually issued, per the spike's rationale ("a hand-synthesized claims object would leave the spike proving that our fixture matches our own policy, which is circular")
- [ ] **Negative control included**: run the `is_local = false` variant first, on a connection pinned to `max: 1`, and require it to leak — proving the mitigation has an exercised failure mode, not just an assertion. Ported from `spikes/m0-drizzle-rls/tests/04-claims-leak.test.ts`
- [ ] **Runs against both the direct connection and the local pooler DSN** — the spike found the pooler behaves identically under 40 interleaved concurrent transactions, but that's only true if it's actually tested, not assumed
- [ ] Covers reads, updates, deletes (all return zero / affect zero rows cross-user) and inserts (rejected `42501`, not silently redirected) across at minimum `workout_sessions` and `session_sets`

### Out of Scope
- Testing every one of the seven user-data tables exhaustively here — M1-06's own isolation tests already do that per-table; this file is specifically the named "tenancy gate," proving the *pattern* end to end on the two tables the spec calls out, plus the harness-validity and leak-negative-control assertions that are unique to this file
- Load testing under sustained concurrency (M4, per `STATE.md`'s open risk on pool exhaustion)
- Testing against a hosted Supabase project (local only for M1, per the residual-risk note in the spike write-up — worth re-asserting during M1 but not blocking it)

---

## Implementation Tasks
- [ ] 1. Port the user-seeding helper from `spikes/m0-drizzle-rls/src/setup-db.ts`, adapted to the real schema (real `profiles`/`workout_sessions`/`session_sets` instead of the spike's two-table sandbox)
- [ ] 2. Port `tests/01-non-vacuity.test.ts`'s role/harness-validity assertions as the first block of this file
- [ ] 3. Port `tests/02-isolation.test.ts`'s cross-user read/write assertions, retargeted at `workout_sessions` and `session_sets`
- [ ] 4. Port `tests/04-claims-leak.test.ts`'s negative control (`withUserLeaky` demonstrating the leak) and positive case (`withUserHardened` closing it)
- [ ] 5. Port `tests/05-pooler.test.ts`'s pooler-DSN coverage, including the 40-interleaved-transaction concurrency check
- [ ] 6. Wire this file into the same CI workflow as M1-07

---

## Acceptance Criteria

### Scenario 1: Happy path — cross-user isolation holds through Drizzle
- **Given** two real GoTrue users, each with a `workout_sessions` row and a `session_sets` row
- **When** authenticated as user A (via `withUserHardened`), queries attempt to read, update, or delete user B's rows — both via explicit filter and via direct primary-key lookup with no filter
- **Then** every read returns zero rows and every write affects zero rows

### Scenario 2: Negative — harness cannot pass vacuously
- **Given** the test suite is accidentally pointed at `MIGRATION_DATABASE_URL`
- **When** the `current_user` assertion (Task 2) runs
- **Then** it fails immediately, before any data assertion runs — proving gate-defeating case 1 from spec §4.2 is closed

### Scenario 3: Negative control — the leak is real, and the fix closes it
- **Given** the `withUserLeaky` variant (`is_local = false`) on a connection pinned to one physical backend
- **When** a claim-less query follows a claims-seeded one on the same connection
- **Then** it reads the previous user's data — and this must be shown failing before the corresponding `withUserHardened` case is shown passing on the identical sequence

### Scenario 4: Pooler fidelity
- **Given** 40 interleaved concurrent transactions alternating between two users, run through the local supavisor pooler
- **When** each transaction reads `session_sets`
- **Then** every transaction sees exactly its own user's rows, with zero cross-contamination

---

## Automated Verification Command
```bash
npx vitest run tests/integration/tenancy.test.ts
```
