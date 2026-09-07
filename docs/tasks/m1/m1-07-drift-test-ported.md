### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2 (gate-defeating case 2)
- **Architectural Decision (ADR)**: `docs/adrs/0003-rls-defense-in-depth.md` Amendment A1
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — this is a merge gate per ADR-0003)
- **Labels**: `area:data`, `area:backend`
- **Depends on**: M1-05, M1-06

---

## User Story & Context

**As a** developer adding tables after M1
**I want** a CI-enforced drift check that fails if any table in `public` lacks RLS, has RLS enabled with zero policies, or carries a `FOR ALL` policy
**So that** a table added in M2, M3, or eight months from now cannot silently ship unprotected — this is "gate-defeating case 2" from spec §4.2, and it must cover tables that don't exist yet.

The M0 spike's drift test only checked `rowsecurity = false`. Running it against a deliberately unprotected table (`unprotected_future_table`) proved that check alone, and then the spike found two more states that look safe but aren't: RLS enabled with no policies (denies everything, which is a broken deploy, not a secure one) and a `FOR ALL` policy (works, but collapses the "never `FOR ALL`" invariant the rest of M1 depends on). Port the widened version, not the original.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Services / Handlers**: `tests/integration/schema-drift.test.ts` (or the project's equivalent integration test path)
- CI config: ensure this test runs on every PR, not just locally

### Non-Negotiable Invariants
- [ ] Query the catalog (`pg_class` / `pg_policy`, joined on `pg_namespace`), not `information_schema.pg_tables`, since the widened check needs `relforcerowsecurity` and per-policy `polcmd`, matching `spikes/m0-drizzle-rls/tests/03-drift.test.ts`
- [ ] Flags a table if **any** of: `relrowsecurity = false`, `relforcerowsecurity = false`, zero rows in `pg_policy` for that table, or any policy has `polcmd = '*'` (FOR ALL)
- [ ] Must be proven to fail, not just proven to pass — port the mutation-check pattern (`spikes/m0-drizzle-rls/scripts/mutation-check.ts`): deliberately break each of the three conditions in a throwaway table/policy, confirm the test catches it, then restore
- [ ] This test is a **merge gate** — wire it into whatever CI runs on PRs for this repo (there is currently no CI; if none exists yet, this task includes adding a minimal GitHub Actions workflow that runs `npm test`)

### Out of Scope
- Fixing any table this test finds unprotected — if M1-05/M1-06 were done correctly, this test should find nothing to fix. If it does find something, that's a bug in this milestone's prior tasks, not scope creep into this one
- The tenancy gate itself (M1-08) — this test checks table *shape*, not actual cross-user data access
- Setting up CI for anything beyond running this test suite (broader CI is not otherwise scoped in M1)

---

## Implementation Tasks
- [ ] 1. Port the `DRIFT_QUERY` from `spikes/m0-drizzle-rls/tests/03-drift.test.ts` into the real test suite, pointed at the real schema
- [ ] 2. Assert the query returns zero rows against the M1-03/05/06 schema as committed
- [ ] 3. Add a per-test mutation: create a throwaway table with no RLS, assert it's flagged, drop it
- [ ] 4. Add a per-test mutation: enable RLS with zero policies on a throwaway table, assert it's flagged, drop it
- [ ] 5. Add a per-test mutation: create a `FOR ALL` policy on a throwaway table, assert it's flagged, drop it
- [ ] 6. Add or extend a GitHub Actions workflow to run `npm test` (including this file) on every PR against `main`
- [ ] 7. Confirm the four-discrete-policies check from M1-05/M1-06 explicitly here too (as in the spike's final assertion), so this one file is the canonical source of truth for "is every table's RLS shape correct"

---

## Acceptance Criteria

### Scenario 1: Happy path — real schema passes clean
- **Given** the M1-03/05/06 schema as committed
- **When** the drift query runs
- **Then** it returns zero flagged tables

### Scenario 2: Negative — each of the three violation types is caught
- **Given** a throwaway table with (a) RLS disabled, (b) RLS enabled with no policies, or (c) a `FOR ALL` policy, created one at a time inside the test
- **When** the drift query runs
- **Then** that table appears in the flagged results, with the correct reason distinguishable in the row (`rls_enabled`, `rls_forced`, `policy_count` columns per the spike's shape)

### Scenario 3: Merge gate is real
- **Given** this test is wired into CI
- **When** a PR is opened that adds a table without RLS (simulated for this issue's verification, then reverted)
- **Then** the CI check fails and blocks merge — verified by actually opening and closing such a PR once, not just by inspecting the YAML

---

## Automated Verification Command
```bash
npx vitest run tests/integration/schema-drift.test.ts
```
