### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.3, §6 (M1 is explicitly the "RED" phase)
- **Architectural Decision (ADR)**: none directly
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p1` (Core — this is the deliverable that makes M1 "RED" rather than just infrastructure)
- **Labels**: `area:backend`
- **Depends on**: M1-15, M1-12

---

## User Story & Context

**As a** developer starting M2
**I want** integration tests written against all 9 route endpoints from spec §4.3 — asserting request/response shape, auth requirements, and error envelopes — that fail because the handlers don't exist yet
**So that** M2's job is precisely "make these tests pass," per the TDD Red-Green-Refactor structure spec §6 explicitly names for the milestone sequence.

This is the task that makes M1 earn the "RED" in its own title. Everything else in M1 (schema, RLS, auth, contracts) is groundwork; this is the actual failing-test artifact M2 is measured against.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Services / Handlers**: `tests/integration/api/sync.test.ts`, `tests/integration/api/sessions.test.ts`, `tests/integration/api/exercises.test.ts`, `tests/integration/api/progress.test.ts`, `tests/integration/api/import-legacy.test.ts` — one file per route group, covering all 9 endpoints from spec §4.3's table
- **Auth coverage**: `tests/integration/api/auth.test.ts` covers `POST /auth/signout`; existing M1-13 tests cover the already-implemented `GET /auth/confirm` callback validation and session exchange
- **Test infrastructure**: `tests/integration/api/test-server.ts` provides a disposable Next HTTP server; `tests/integration/api/fixtures.ts` provides real Supabase cookie-backed sessions without request-provided user IDs or client-side token storage
- No handler implementations — that's M2's job. These tests must fail with "route not found" / 404, not compile errors, proving the contracts (M1-15) are independently valid even though nothing serves them yet

### Non-Negotiable Invariants
- [x] Every test imports and validates against the M1-15 contracts — no test hand-rolls its own expected shape
- [x] Every mutating route's test includes an unauthenticated case (expect 401 via `requireUser()`, M1-12) and, where applicable, a cross-user/foreign-resource case (expect the response to reflect only the authenticated user's data — this is a behavioral assertion for M2 to satisfy, correctly failing for now since no handler exists)
- [x] `POST /api/sync`'s test covers all four mutation `op` variants from M1-15, plus the 200-item batch cap and the idempotent-replay case (same `mutationId` twice → `applied` without re-executing, per spec §4.4)
- [x] `POST /api/import/legacy`'s test covers all three legacy key shapes from spec §4.5 (`pushWorkoutProgress`, `legsWorkoutProgress`, `pullDayProgress`) including the documented pull-day data-loss case (aggregate-only recovery)
- [x] Rate-limit assertions included where spec §4.3 specifies one (`/api/sync` 120/min/user, `/api/import/legacy` 5/hour/user) — as failing tests for now, real enforcement is M2

### Out of Scope
- Any handler implementation (M2)
- `SessionEngine`, `SyncEngine`, `ProgressionEngine`, `LegacyImporter` internal logic — M2 owns making these tests pass, this task only specifies the contract-level behavior expected at the HTTP boundary
- E2E/browser-level tests (M3/M4 — Playwright)

---

## Implementation Tasks
- [x] 1. Write `tests/integration/api/sync.test.ts`: all 4 `op` variants, batch cap, idempotent replay, unauthenticated case, rate limit
- [x] 2. Write `tests/integration/api/sessions.test.ts`: `GET /api/sessions` pagination, `POST /api/sessions` idempotent-on-`clientId` (returns existing active session), `GET /api/sessions/:id` with `?since=`
- [x] 3. Write `tests/integration/api/exercises.test.ts`: `GET /api/exercises` cacheable response (`s-maxage=3600` header expectation), returns seeded data once M1-09 lands
- [x] 4. Write `tests/integration/api/progress.test.ts`: `GET /api/progress/:exerciseSlug` shape and traversal validation
- [x] 5. Write `tests/integration/api/import-legacy.test.ts`: all three legacy key shapes, idempotency on `source_fingerprint`, partial-failure tolerance
- [x] 6. Run the API integration suite and confirm the missing-handler assertions fail with 404/not-found responses, not a contract/type error — a contract error would mean M1-15 has a bug that needs fixing now, not deferred to M2
- [x] 7. Record the RED baseline in `docs/tasks/m1-red-baseline.txt` so M2's "all M1 tests go green" claim is checkable against a concrete artifact

---

## Acceptance Criteria

### Scenario 1: Happy path — tests are well-formed and fail for the right reason
- **Given** no route handlers exist yet
- **When** the full test suite in `tests/integration/api/` is run
- **Then** every test fails with a 404/"not found" style error, and zero tests fail due to a TypeScript or Zod schema error — proving the tests themselves, and the M1-15 contracts they import, are valid

### Scenario 2: Coverage — every route from spec §4.3 has at least one test
- **Given** the 9-endpoint table in spec §4.3
- **When** cross-referencing against the test files written in this task
- **Then** every route has at least a happy-path and an error-path assertion (`/auth/confirm` and `/auth/signout` covered by M1-13 may be referenced rather than duplicated, but must be listed as covered somewhere)

### Scenario 3: Idempotency is specified, not assumed
- **Given** `POST /api/sync` is called twice with an identical `mutationId`
- **When** the test asserts on the (currently failing, pre-M2) expected behavior
- **Then** the test encodes "second call reports the mutation as `applied` without a duplicate side effect" as its assertion — so M2 has no ambiguity about what "idempotent" means here

### Scenario 4: This becomes M2's exit criteria
- **Given** the RED baseline recorded in Task 7
- **When** M2 is later marked complete
- **Then** re-running the identical test files shows 100% pass, with no test silently removed or weakened to make the number work — verified by diffing the M1 test files against whatever exists at M2's completion

---

## Completion Notes (2026-09-08)

- Branch: `test/m1-16-route-handler-red`.
- Added the HTTP harness, real SSR-cookie Supabase fixtures, and endpoint suites for sync, sessions, exercises, progress, legacy import, and signout. No API route handlers were added.
- The existing `/auth/confirm` handler's malformed-input check passes through the new HTTP harness; the two signout tests fail at the missing-handler boundary. The deeper M1-13 callback coverage remains in `tests/integration/auth-confirm.test.ts`.
- Fixed a merged M1-15 Next/Turbopack compatibility issue by using extensionless relative imports in `lib/auth/magic-link.ts` and the `lib/contracts/` graph. This was required to ensure the existing callback route did not fail with a module-resolution error before the RED assertions ran.
- Fixed the test server's process-group cleanup and extended the sync rate-limit test timeout so the baseline contains no leaked-server, port-collision, or default-timeout failures. The Supabase anon-key fallback matches the well-known local CI key.
- Baseline: `docs/tasks/m1-red-baseline.txt` records `22 failed | 1 passed (23)` across 6 files. All 22 failures are HTTP 404 responses from missing M2 routes; the one passing test targets the already-existing M1-13 callback handler.
- Validation passed: `npm run typecheck`; `npx eslint lib/auth/magic-link.ts lib/contracts tests/integration/api`; language diagnostics for changed TypeScript files were empty.

---

## Automated Verification Command
```bash
npx vitest run tests/integration/api/  # expect missing M2 handlers to fail at 404/not-found, zero contract errors
```
