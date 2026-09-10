# feat(m3): profile endpoints and session prefill reads

### Metadata
- **Local Task**: `M3-00`
- **Related Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` §4.1, §2.1 G6/G-M3-1, §8.5
- **Architectural Decisions**: ADR-0003 (two authorization layers), ADR-0005 (kg canonical, display unit)
- **Milestone**: `M3: Presentation`
- **Priority**: `#priority/p1` — nothing downstream can honour ADR-0005 without it
- **Labels**: `area:backend`, `area:data`, `area:perf`, `type:feature`
- **Kanban Status**: `To Do`
- **Depends on**: nothing (first M3 slice)

## User Story & Context
**As a** user lifting in pounds
**I want** the app to remember that preference on the server and to prefill the weight and reps I used last time
**So that** logging a set stays one tap (G6) and no screen has to derive "my last session" on the client

`profiles.preferred_unit` exists (`db/schema/index.ts:67`, `notNull default 'kg'`) and **nothing reads or
writes it**; a search for prefill code across `lib/` and `src/` returns nothing. Both gaps are closed here
before any screen is planned against them.

## Technical Scope & Invariants
### Files and seams
- `lib/contracts/profile.ts` (new), `lib/contracts/sessions.ts` (extension: `SessionPrefillQuerySchema`, `PrefillEntrySchema`)
- `src/app/api/profile/route.ts` (new GET/PATCH), `src/app/api/sessions/prefill/route.ts` (new)
- `lib/repositories/profile-repository.ts` (new), prefill query added to `lib/repositories/workout-repository.ts`
- `tests/integration/api/profile.test.ts`, `tests/integration/repository/*`, `tests/unit/api/contract-graph.test.ts`

### Non-negotiable invariants
- [ ] Every repository method takes `userId` first and runs inside `withUser()` (ADR-0003). No exceptions: unlike `ContentRepository`, both of these read **user** rows.
- [ ] `PATCH /api/profile` accepts only `preferredUnit` and `displayName`. Email and identity are not client-editable.
- [ ] Units are **canonical kg in storage**; the API never converts. Display conversion is a client concern (`UnitDisplay`, M3-06+).
- [ ] Runtime code uses `DATABASE_URL`; `MIGRATION_DATABASE_URL` never appears in a request path.
- [ ] Prefill returns `exerciseId`, `setIndex`, `weightKg`, `reps`, `sourceLocalDate` — **provenance is part of the contract**, a suggestion without a date is untrustable.
- [ ] No migration expected. If `EXPLAIN (ANALYZE, BUFFERS)` justifies an index, it is `CREATE INDEX CONCURRENTLY` in its own migration file outside a transaction.

### Out of scope
- The settings screen that calls `PATCH /api/profile` (M3-09). Delta reads (M3-01). Any UI.

## Implementation Tasks
- [ ] 1. Write the two contracts and failing API specs first (RED): 200/401/400 shapes, prefill provenance.
- [ ] 2. Implement `profile` GET/PATCH and the prefill query; keep `excludeSessionId` from prefilling the session being started.
- [ ] 3. Run `EXPLAIN (ANALYZE, BUFFERS)` at seeded scale (push day, 18 exercises, ≥40 archived sessions) and record the plan plus the index decision **in the PR description**, not in a comment.
- [ ] 4. Add both routes to the contract-graph test so they cannot drift from `lib/contracts/`.

## Acceptance Criteria
### Scenario 1: Happy path
- **Given** an authenticated user with three archived sessions containing bench-press sets
- **When** `GET /api/sessions/prefill?routineDayId=<push>` is called
- **Then** 200 returns one entry per exercise/setIndex from the most recent completed session, with `sourceLocalDate` set, and `PATCH /api/profile {"preferredUnit":"lb"}` then `GET /api/profile` echoes `"lb"`

### Scenario 2: Negative & error
- **Given** no credentials
- **When** either endpoint is called
- **Then** 401 with `UNAUTHENTICATED`; and `PATCH /api/profile {"email":"x@y.z"}` is **400 `VALIDATION_ERROR`** (strict schema), never a silently ignored field

### Scenario 3: Boundary & isolation
- **Given** user B has logged heavier sets than user A
- **When** A requests prefill
- **Then** A receives only A's values — and a prefill entry for a custom exercise deleted since logging still resolves, or is omitted rather than guessed

## Automated Verification
```bash
npm run typecheck && npm run lint
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run \
  tests/integration/api/profile.test.ts tests/integration/api/sessions.test.ts
npm run test:mutation
```
