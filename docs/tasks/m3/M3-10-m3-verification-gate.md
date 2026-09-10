# test(m3): verify M3's claims with measurements and hand the milestone over honestly

### Metadata
- **Local Task**: `M3-10`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §2.1, §7, §8; M3 exit criteria in §6
- **Architectural Decisions**: ADR-0003, ADR-0004, ADR-0005
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p0` — this is the slice that decides whether M3 is allowed to be called done
- **Labels**: `area:ui`, `area:perf`, `type:test`
- **Kanban Status**: `To Do`
- **Depends on**: M3-00…M3-09 all merged

## User Story & Context
**As a** maintainer entering M4
**I want** each M3 goal re-measured on a production build and the residual risks written down rather than absorbed
**So that** "the UI is accessible and works offline" is a claim with a number behind it, in the same style M2-06 used when it refused to assert a dev-mode p95 as a production one

## Technical Scope & Invariants
### Files and seams
- `tests/e2e/a11y.spec.ts`, `tests/e2e/offline-session.spec.ts`, `tests/e2e/sla.spec.ts`, new `docs/tests/` audit record, `docs/STATE.md`, `PROMPTKIT.md`

### Non-negotiable invariants
- [ ] **Every number in the M3 exit report is measured on the production build.** Dev-mode numbers are labelled as such, or they do not appear.
- [ ] **No claim without a control that was observed to fail.** Each gate gets a recorded "break it and watch it go red" line, per the standing protocol: a control that never fired is not a disarmed one.
- [ ] G-M3-2 (<50 ms tap), G-M3-3 (<5 s cross-device), G-M3-4 (60-mutation drain <5 s) measured with their stated methods; G-M3-5 Lighthouse 100 on `/`, `/session/[id]`, `/history`.
- [ ] The outstanding **production-mode p95 for `/api/sync`** is finally measured against the documented 200 ms @ 50 rps and the result recorded in STATE §5 whichever way it falls.
- [ ] Keyboard-only completion of a full session, with no mouse events available to the test, not merely "tab works".
- [ ] axe clean on all three routes; an explicit audit that no completion, phase, or day state is carried by colour alone; the token contrast gate still green.
- [ ] **Legacy parity check**: the four legacy modules on :3000 are untouched, and the five legacy `localStorage` keys are never written by the new app.
- [ ] STATE/PROMPTKIT describe what exists, with numbers re-measured on merged `main` after the last slice lands.

### Out of scope
- M4 work: telemetry, Sentry, load testing at 50 rps, deleting legacy modules or keys, `SECURITY_IMPROVEMENTS.md` cleanup. Realtime privilege expansion.

## Implementation Tasks
- [ ] 1. Write the SLA specs and record raw distributions (median, p95, max) — not just pass/fail — so the margin is visible.
- [ ] 2. Break each gate deliberately, capture the failure output, restore. Log all four in the audit record.
- [ ] 3. Close every WCAG finding rather than filing it; anything genuinely deferred goes to STATE §5 as a named risk with a reason.
- [ ] 4. Refresh `docs/STATE.md` §1/§2/§3/§5/§7/§8 and `PROMPTKIT.md` §2/§3 to the merged reality, and write the M4 handoff (which is: hardening + decommission, plus everything M3 explicitly did not do).

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** the full M3 surface merged
- **When** the verification suite runs on a production build
- **Then** all seven goals pass with recorded numbers, and the run is reproducible from one documented command sequence

### Scenario 2: Negative — the gates bite
- **Given** an injected violation (a colour-only completion state, or an off-budget tap latency)
- **When** the suite runs
- **Then** it fails with the measured value in the message, and the injected violation is removed and reported in the audit, not kept as a passing test

### Scenario 3: Boundary — honest failure
- **Given** a production p95 that misses the documented 200 ms
- **Then** STATE §5 records the measured miss and the decision taken; the SLA is **not** quietly relabelled, and the test is not loosened to fit

## Automated Verification
```bash
npm run test:api:preflight && npm run lint && npm run typecheck
npm test && npm run test:api && npm run test:mutation
npm run next:build && npx playwright test --reporter=list
npx lighthouse http://localhost:3001/ --only-categories=accessibility --output=json
```
