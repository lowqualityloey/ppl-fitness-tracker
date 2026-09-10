# test(m3): stand up the Playwright and accessibility gates before trusting either

### Metadata
- **Local Task**: `M3-03`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §2.3, §5.3, §8.3; intake debt **D7**
- **Architectural Decisions**: ADR-0001
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p0` — every M3 goal depends on measurements that do not exist yet
- **Labels**: `area:infra`, `area:perf`, `type:test`
- **Kanban Status**: `To Do`
- **Depends on**: M3-02 (there must be a styled surface to point the harness at)

## User Story & Context
**As a** reviewer of the next six slices
**I want** an E2E and accessibility harness that is proven capable of failing
**So that** "the E2E gate is green" is evidence rather than decoration

`playwright.config.ts` exists and is correct — `testDir: "./tests/e2e"`, `baseURL: :3001`, and a webServer
running `npm run next:build && npm run next:start`, i.e. **production mode**. `tests/e2e/` does not exist.
D7 said exactly this and stayed open because no one was forced to act on it. This slice also gives us the
first honest measurement of the `/api/sync` p95 the M2-06 gate could only bound in dev mode.

## Technical Scope & Invariants
### Files and seams
- `tests/e2e/harness.spec.ts` (the control), `tests/e2e/a11y.spec.ts`, CI job in `.github/workflows/test.yml`
- axe-core wired as an assertion helper, not a report; Lighthouse CI for `/`

### Non-negotiable invariants
- [ ] **The harness's first test must be a deliberately failing control**: a spec asserting an accessibility violation *exists* on a page with one, passing only when the detector catches it. Then delete the injected violation and watch it flip. Documented in the PR.
- [ ] E2E runs against the **production build** only. Dev-mode numbers are never quoted as SLA evidence (M2-06 set that precedent with its 200 ms/800 ms split).
- [ ] The API suites own route contracts; E2E owns user-visible flows. No E2E may be the only proof that a contract is enforced — CI order stays lint → preflight → `npm test` → `test:api` → E2E.
- [ ] E2E never runs against the shared Supabase project's production data: it creates its own GoTrue users and cleans up in `afterAll`, like the API suites.
- [ ] `reuseExistingServer: !process.env.CI` stays: in CI it must boot its own prod server, locally it must not rebuild every run.
- [ ] Any E2E needing seeded system content calls `seedExercises(MIGRATION_DATABASE_URL)` itself — **CI has no seed step**.

### Out of scope
- Offline drain tests (M3-05/M3-06 own the behaviour; this slice owns the plumbing). Load testing at 50 rps (M4).

## Implementation Tasks
- [ ] 1. Create `tests/e2e/`, install browsers in CI, add the job behind the existing gates.
- [ ] 2. Write the failing-control spec and prove it flips.
- [ ] 3. Add the axe assertion helper + Lighthouse for `/` (score 100 is M3-04's problem; this slice only makes it measurable).
- [ ] 4. Capture a `/api/sync` prod-mode p95 baseline over ≥50 requests and record it in `docs/STATE.md` §5 next to the outstanding-budget claim, so the open item is quantified rather than implied.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** a clean checkout
- **When** `npx playwright test` runs
- **Then** the control passes on the production build, and the CI job fails the whole workflow if any spec fails

### Scenario 2: Negative — the gate bites
- **Given** an element injected without an accessible name
- **When** the axe spec runs
- **Then** it reports that specific violation and the job exits non-zero

### Scenario 3: Boundary
- **Given** CI without `MIGRATION_DATABASE_URL` seeded
- **When** an E2E needs system content
- **Then** it seeds what it needs and the failure mode is a clear precondition error, not a silent skip

## Automated Verification
```bash
npm run next:build && npx playwright test --reporter=list
# then prove the control can fail:
npm run test:api && npm test
```
