# test(m2): close API baseline and harden domain engine

### Metadata
- **Local Task**: `M2-06`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0003-rls-defense-in-depth.md`, `docs/adrs/0004-focus-ring-contrast-override.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p0`
- **Labels**: `area:backend`, `area:auth`, `area:data`, `area:perf`, `type:test`
- **Kanban Status**: `To Do`

## User Story & Context

**As a maintainer preparing M3**  
**I want** all M1 route contracts and M2 security/performance gates green  
**So that the presentation layer can consume a stable, isolated domain API.

## Technical Scope & Invariants

- Close the RED baseline for sessions, sync, exercises, progress, import, and signout.
- Keep `npm test` excluding API files and run API integration separately with serialized shared fixtures.
- Re-run app-role/current-user, RLS/FORCE, four-policy, schema-drift, pooler GUC isolation, and cross-user tests.
- Review route error/status disclosure, transaction rollback, duplicate/race behavior, and p95 transaction cost.
- Do not delete legacy source or claim SMTP production readiness.

### Out of scope

M3 UI migration, design-token implementation, production SMTP/provider setup, and M4 legacy decommissioning.

## Implementation Tasks

- [ ] Turn each remaining API RED failure into a green contract/integration test.
- [ ] Add security negative controls that fail when RLS/claim scoping is removed.
- [ ] Add race/rollback and bounded-payload performance checks.
- [ ] Run typecheck/lint/non-RED/API/schema drift/tenancy suites in documented order.
- [ ] Update release/state artifacts with residual risks and M3 handoff.

## Acceptance Criteria

### Scenario 1: API baseline green
- **Given** the local Supabase stack and deterministic fixtures
- **When** the full API integration suite runs
- **Then** all M1 route tests pass with canonical envelopes and no expected missing-handler failures.

### Scenario 2: Security gate
- **Given** two Auth users and the non-owner app role
- **When** the tenancy/RLS suite attempts cross-user reads/writes and a claim-isolation mutation
- **Then** all forbidden data paths return zero/404/typed errors and the negative-control suite fails if protections are removed.

### Scenario 3: Reliability/performance gate
- **Given** duplicate requests, concurrent starts/mutations, rollback faults, and bounded payloads
- **When** the hardening suite runs
- **Then** no duplicate side effects or partial writes occur, and measured latency remains within the documented M2 budget.

### Scenario 4: Clean handoff
- **Given** all M2 gates pass
- **When** the state tracker and artifacts are reviewed
- **Then** issue/task status, residual schema risks, and M3 prerequisites are accurate and no SMTP or legacy-decommission work is misrepresented as complete.

## Automated Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:red
npx drizzle-kit check
git diff --check
git grep -n -E '\[DEBUG-|console\.log\("DEBUG|dbg!\(' || true
```

## GitHub CLI Recipe

```bash
gh issue create \
  --title "test(m2): close API baseline and harden domain engine" \
  --body-file docs/tasks/m2/M2-06-route-hardening.md \
  --label "area:backend,area:auth,area:data,area:perf,type:test,priority:p0" \
  --milestone "M2: Core Domain Engine"
```
