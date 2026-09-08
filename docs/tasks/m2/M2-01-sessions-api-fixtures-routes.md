# feat(sessions): wire session routes and deterministic fixtures

### Metadata
- **Local Task**: `M2-01`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0002-supabase-auth-over-clerk.md`, `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p1`
- **Labels**: `area:backend`, `area:auth`, `type:feature`, `type:test`
- **Kanban Status**: `To Do`

## User Story & Context

**As a** signed-in lifter  
**I want** to list, start, and reopen my workout sessions through authenticated HTTP routes  
**So that** durable history is available without exposing another user's data or trusting client-supplied identity.

## Technical Scope & Invariants

### Files, tables, and endpoints
- Add `src/app/api/sessions/route.ts` for `GET` and `POST`.
- Add `src/app/api/sessions/[id]/route.ts` for `GET`.
- Extend `tests/integration/api/fixtures.ts` or add a dedicated deterministic DB fixture helper; update `tests/integration/api/sessions.test.ts`.
- Consume `lib/contracts/sessions.ts`, `lib/contracts/envelope.ts`, `requireUserContext()`, `getDb()`, and `WorkoutRepository`.
- Fixture tables: `profiles`, `workout_sessions`, `session_sets`, `session_tasks`, plus seeded `routine_days`, `routine_exercises`, and `exercises`.

### Non-negotiable invariants
- Identity comes only from verified `auth.getUser()`; no `userId` body/query/header is accepted.
- Every repository call passes `userId` first and preserves explicit predicates plus RLS.
- Only `DATABASE_URL` is used by route runtime; owner DSN is fixture setup only.
- Zod parses every query/path/body boundary; all responses use the AppError envelope.
- Session state is domain-mapped; raw Drizzle rows and SQL errors never cross the route boundary.
- `since` is parsed for contract compatibility but returns full state until M2-04 creates a real change model.

### Out of scope
- Set/task/phase mutations, SessionEngine, progression, sync, import, UI, true delta reduction, device metadata, LWW, SMTP, and legacy source changes.

## Implementation Tasks

- [ ] Add deterministic owner/cross-user Auth and database fixture setup/cleanup without reading `.env.local`.
- [ ] Implement shared route error translation for AppErrorException, Zod, not-found, conflict, and generic errors.
- [ ] Implement GET list with cursor validation and mapped page response.
- [ ] Implement POST start with UTC fallback local date documented as an interim boundary until a timezone contract exists.
- [ ] Implement GET detail with UUID/`since` validation and cross-user 404 behavior.
- [ ] Add invalid-input, duplicate, conflict, and isolation assertions alongside the existing RED cases.

## Acceptance Criteria

### Scenario 1: Paginated history
- **Given** a seeded authenticated user with deterministic sessions
- **When** `GET /api/sessions?cursor=opaque-cursor` is sent with only the SSR cookie
- **Then** the handler returns HTTP 200 and a strict `SessionsListResponseSchema` envelope with mapped summaries and nullable `nextCursor`.

### Scenario 2: Idempotent start
- **Given** a valid seeded routine day and UUID client id
- **When** the same authenticated `POST /api/sessions` body is sent twice
- **Then** both responses are 200/201, validate as `SessionStartResponseSchema`, and have deeply equal data.

### Scenario 3: Full detail and accepted since
- **Given** an owned session id
- **When** `GET /api/sessions/:id?since=10` is sent
- **Then** the handler returns HTTP 200, validates as `SessionDetailResponseSchema`, and does not claim the full state is a true delta.

### Scenario 4: Authentication and validation errors
- **Given** no cookie, malformed JSON, invalid UUID, invalid cursor, or invalid sequence
- **When** the corresponding request is sent
- **Then** the response is respectively 401 `UNAUTHENTICATED` or 400 `VALIDATION_ERROR` in the canonical envelope.

### Scenario 5: Cross-user isolation
- **Given** a session owned by a second Auth user
- **When** the first user requests that session id
- **Then** the response is indistinguishable from missing: HTTP 404 with `NOT_FOUND`, with no leaked state.

### Scenario 6: Active-day conflict
- **Given** an unresolved conflicting active-day start
- **When** the handler receives the start request
- **Then** it returns HTTP 409 `CONFLICT` and does not expose database constraint text.

## Automated Verification

```bash
npm run typecheck
npx vitest run tests/integration/api/sessions.test.ts
npm test
```

The API suite requires the local Supabase stack and runtime/owner URLs supplied by the test environment; `.env.local` must not be read or modified by the implementation session.

## GitHub CLI Recipe

```bash
gh issue create \
  --title "feat(sessions): wire session routes and deterministic fixtures" \
  --body-file docs/tasks/m2/M2-01-sessions-api-fixtures-routes.md \
  --label "area:backend,area:auth,type:feature,type:test,priority:p1" \
  --milestone "M2: Core Domain Engine"
```
