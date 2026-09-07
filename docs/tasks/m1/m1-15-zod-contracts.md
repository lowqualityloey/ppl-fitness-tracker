### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.3
- **Architectural Decision (ADR)**: none directly — required by `PROMPTKIT.md` §6 guardrail
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p1` (Core — needed before M1-16's tests and every M2 handler)
- **Labels**: `area:backend`
- **Depends on**: M1-03

---

## User Story & Context

**As a** developer implementing route handlers in M2
**I want** the Zod schemas from spec §4.3 — `SyncMutationSchema`, `SyncRequestSchema`, `SyncResponseSchema`, and equivalents for every other route — plus the shared `{ ok: true, data: T } | { ok: false, error: AppError }` envelope, written and unit-tested before any handler exists
**So that** M1-16 can write real failing tests against real contracts (RED), and M2 has an unambiguous target to implement against (GREEN).

Route surface, per spec §4.3's table — 9 endpoints total: `POST /api/sync`, `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/:id`, `GET /api/exercises`, `GET /api/progress/:exerciseSlug`, `POST /api/import/legacy`, `GET /auth/confirm`, `POST /auth/signout`. (The last two are covered by M1-13, but their param schemas belong here for consistency.)

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **New**: `lib/contracts/sync.ts`, `lib/contracts/sessions.ts`, `lib/contracts/exercises.ts`, `lib/contracts/progress.ts`, `lib/contracts/import.ts`, `lib/contracts/envelope.ts` (or a single `lib/contracts/index.ts` if the project prefers fewer files — pick one convention and note it in the PR)
- No route handler implementations — contracts only

### Non-Negotiable Invariants
- [ ] **Unified envelope** `{ ok: true, data: T } | { ok: false, error: AppError }` used by every contract, per `PROMPTKIT.md` §6's "Deterministic Error Handling" guardrail
- [ ] `SyncMutationSchema` is a `z.discriminatedUnion('op', [...])` exactly as sketched in spec §4.3, covering `set.upsert`, `task.complete`, `phase.advance`, `session.finish` — the spec only fully writes out `set.upsert`; this task must fully specify the other three, not leave them as `/* … */`
- [ ] `weightKg` bounded `0`–`1000`, `reps` bounded `0`–`1000`, matching the database `check` constraints from M1-03 — Zod and the database must agree on these bounds, since spec §5 explicitly says "application validation is not a data integrity guarantee" and relies on both layers agreeing
- [ ] `mutations` array capped at 200 per `SyncRequestSchema`, matching spec §4.3
- [ ] `token_hash` / `type` params for `/auth/confirm` are Zod-validated, per spec §5's explicit callout (coordinate with M1-13, which consumes this)

### Out of Scope
- Route handler logic (M2)
- `SessionStateSchema` internals beyond what's needed to type `SyncResponseSchema.state` — full session-state shape can be stubbed as `z.object({}).passthrough()` if `SessionEngine` (M2) hasn't finalized it yet, with a `// TODO(M2)` comment, since blocking this contract task on M2's engine design would create a circular dependency

---

## Implementation Tasks
- [ ] 1. Write `AppError` and the discriminated envelope type in `lib/contracts/envelope.ts`
- [ ] 2. Write `SyncMutationSchema` fully (all four `op` variants), `SyncRequestSchema`, `SyncResponseSchema`
- [ ] 3. Write contracts for `GET /api/sessions` (query params: `cursor`), `POST /api/sessions` (body: `routineDayId`, `clientId`), `GET /api/sessions/:id` (path + optional `since` query)
- [ ] 4. Write contract for `GET /api/exercises` (no input; output shape only)
- [ ] 5. Write contract for `GET /api/progress/:exerciseSlug` (path param validation, output: e1RM trendline shape)
- [ ] 6. Write contract for `POST /api/import/legacy` (raw localStorage payload shape — coordinate with spec §4.5's three divergent key shapes)
- [ ] 7. Write contracts for `/auth/confirm` query params and `/auth/signout` (likely no body)
- [ ] 8. Unit-test every schema: one valid-input pass case, and one invalid-input case per meaningfully distinct validation rule (bounds, required fields, discriminant mismatch)

---

## Acceptance Criteria

### Scenario 1: Happy path — valid payloads parse
- **Given** a `set.upsert` mutation payload matching the spec's shape, with `weightKg: 60.5`, `reps: 8`
- **When** parsed against `SyncMutationSchema`
- **Then** it succeeds and the discriminated union narrows correctly to the `set.upsert` variant

### Scenario 2: Negative — bounds enforced
- **Given** a `set.upsert` payload with `weightKg: 1500` (exceeds 1000)
- **When** parsed against `SyncMutationSchema`
- **Then** Zod rejects it, and the bound matches exactly the database `check` constraint from M1-03 (both must reject at the same value, verified by a shared-fixture test if feasible)

### Scenario 3: Negative — oversized batch
- **Given** a `SyncRequestSchema` payload with 201 mutations
- **When** parsed
- **Then** it's rejected — proving the 200-item cap from spec §4.3 is enforced, not just documented

### Scenario 4: Envelope consistency
- **Given** any contract's error case
- **When** constructing an `AppError` response
- **Then** it always matches `{ ok: false, error: AppError }` — no handler-specific ad hoc error shape

---

## Automated Verification Command
```bash
npx vitest run tests/unit/contracts/*.test.ts
```
