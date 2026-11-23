### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2
- **Architectural Decision (ADR)**: `docs/adrs/0003-rls-defense-in-depth.md` Amendment A1.1
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — every route handler and repository method depends on this)
- **Labels**: `area:backend`
- **Depends on**: M1-04

---

## User Story & Context

**As a** developer writing repository code
**I want** exactly one `withUser` helper in the codebase — the hardened, two-`set_config` version proven by the M0 spike — with no simpler variant available to accidentally import instead
**So that** the GUC-ordering hazard the spike found (Amendment A1.1) cannot regress by someone reaching for the "obvious" one-statement version described in the spec's original §4.2 code sample.

The spec's `withUser` as originally written only sets `request.jwt.claims`. The spike found `auth.uid()` checks the legacy singular GUC `request.jwt.claim.sub` *first*, so a stale session-scoped value there silently outranks correctly-set transaction-local claims. `withUserHardened()` in `spikes/m0-drizzle-rls/src/db.ts` closes this by blanking the legacy GUC first. This task makes that the *only* version that exists in the app, named `withUser` (not `withUserHardened` — the "hardened" name was only needed in the spike to distinguish it from the deliberately-broken negative control, which has no reason to exist outside a test fixture).

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Services / Handlers**: `lib/db/with-user.ts` (or the project's equivalent repository-layer location)
- Consumed by every future repository method and route handler that touches user-scoped data — this task only creates the helper, M2 is where repository methods are built on top of it

### Non-Negotiable Invariants
- [ ] **Two `set_config` calls, both `is_local = true`**: first blank `request.jwt.claim.sub`, then seed `request.jwt.claims` — exact order matters, per Amendment A1.1
- [ ] **No single-statement variant exists anywhere in the codebase.** If a lint rule can enforce "no direct `set_config('request.jwt.claims', ...)` call outside this one file," add it — this is the same spirit as the existing lint rule (ADR-0003) banning a literal `false` or missing third argument on `set_config`
- [ ] Takes `claims: JwtClaims` (real GoTrue-shaped claims, `sub` load-bearing) and a callback `(tx) => Promise<T>`, matching the spike's signature
- [ ] **No negative-control (`withUserLeaky`) variant ships in application code.** It exists only inside M1-08's test file as a fixture, imported from the test path, never from `lib/`
- [ ] Repository methods built on this helper take `userId` as a required first positional argument (ADR-0003 invariant 5) — this task doesn't build repository methods yet, but the helper's shape must not obstruct that requirement later

### Out of Scope
- Actual repository methods (`WorkoutRepository`, etc.) — M2
- Route handlers that call this helper — M1-16 writes failing tests against handlers that don't exist yet; M2 implements them
- The negative control fixture itself — that lives in M1-08's test file, not here

---

## Implementation Tasks
- [ ] 1. Port `withUserHardened()` from `spikes/m0-drizzle-rls/src/db.ts`, renamed to `withUser`, into `lib/db/with-user.ts`
- [ ] 2. Port the `JwtClaims` type
- [ ] 3. Do **not** port `withUserLeaky()` into application code — leave it out entirely; M1-08 defines its own local fixture if it needs to demonstrate the leak
- [ ] 4. Write a unit/integration test proving the two-statement order: seed a stale `request.jwt.claim.sub` at session scope, call `withUser` with different claims, assert the *new* claims win (this is the regression test for A1.1 specifically, distinct from M1-08's broader tenancy gate)
- [ ] 5. Add a lint rule or code-review checklist item (document in `PROMPTKIT.md` §6 if a lint rule isn't feasible) banning direct `set_config('request.jwt.claims', ...)` calls outside this file

---

## Acceptance Criteria

### Scenario 1: Happy path — claims apply correctly
- **Given** two users A and B with data in `session_sets`
- **When** `withUser(db, userA.claims, tx => tx.select().from(sessionSets))` is called
- **Then** only A's rows are returned

### Scenario 2: The specific hazard this helper exists to close
- **Given** `request.jwt.claim.sub` has been set to user B's id at session scope (simulating a hypothetical stale value from an unrelated code path)
- **When** `withUser` is called with user A's claims
- **Then** the query inside the callback sees user A's data, not B's — proving the legacy-GUC blank happens before the real claims are seeded

### Scenario 3: No leaky variant reachable from application code
- **Given** the codebase as committed
- **When** searching `lib/`, `app/`, and any other non-test source directory for `set_config` calls with a literal `false` third argument, or for any export named `withUserLeaky`
- **Then** none are found — this is a static check, run as part of this task's own verification, not something deferred to a later lint task

---

## Automated Verification Command
```bash
npx vitest run tests/integration/with-user.test.ts   # moved out of tests/unit/ when D2 closed (2026-11-24)
grep -rn "set_config.*,\s*false\s*)" lib/ app/ --include="*.ts" --include="*.tsx" || echo "OK: no is_local=false in application code"
```
