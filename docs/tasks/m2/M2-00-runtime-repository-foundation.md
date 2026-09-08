# refactor(m2): review and commit runtime repository foundation

### Metadata
- **Local Task**: `M2-00`
- **Related Spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Architectural Decisions**: `docs/adrs/0002-supabase-auth-over-clerk.md`, `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: `M2: Core Domain Engine`
- **Priority**: `#priority/p0`
- **Labels**: `area:backend`, `area:auth`, `type:refactor`
- **Kanban Status**: `Done`

## User Story & Context

**As a** maintainer of the target backend  
**I want** the runtime database, verified identity, RLS transaction, domain mapper, and repository seams reviewed as one atomic foundation  
**So that** later route and engine work cannot bypass user scoping or accidentally use the migration owner connection.

## Technical Scope & Invariants

### Files and seams
- `lib/db/client.ts`, `lib/db/types.ts`, `lib/db/auth-context.ts`, `lib/db/with-user.ts`
- `lib/auth/require-user.ts`
- `lib/domain/sessions/`
- `lib/repositories/workout-repository.ts`
- Focused unit and repository integration tests under `tests/unit/` and `tests/integration/repository/`

### Non-negotiable invariants
- Runtime code reads `DATABASE_URL` only; `MIGRATION_DATABASE_URL` is never a request-path fallback.
- `claims.sub === userId` is asserted before `withUser()`.
- `withUser()` blanks the singular GUC and sets claims with `is_local=true` inside the transaction.
- Repository methods take `userId` first, apply explicit predicates, and map rows to domain values.
- Legacy folders remain untouched.

### Out of scope
- API routes, SessionEngine mutations, sync, import, UI, schema migrations, and SMTP issue #16.

## Implementation Tasks

- [ ] Review runtime DSN/client lifecycle and close behavior.
- [ ] Review verified Auth context and mismatch rejection.
- [ ] Review two-GUC RLS transaction setup and existing negative controls.
- [ ] Review session cursor/list/find/start repository behavior and race handling.
- [ ] Run focused and full non-RED validation.
- [ ] Create one Conventional Commit after the plan/issues are recorded.

## Acceptance Criteria

### Scenario 1: Runtime database isolation
- **Given** a request-path caller initializes the runtime database
- **When** the client is created
- **Then** it uses `DATABASE_URL` and rejects an empty runtime URL without consulting `MIGRATION_DATABASE_URL`.

### Scenario 2: Verified identity and RLS claims
- **Given** a verified Supabase user and explicit repository `userId`
- **When** the repository enters a transaction
- **Then** mismatched identities are rejected and both transaction-local GUC protections are applied before queries.

### Scenario 3: User-scoped repository
- **Given** two users and sessions owned by each
- **When** user A lists/finds/starts through the repository
- **Then** user A receives only A's mapped domain state, and no raw Drizzle row or B-owned session is returned.

### Scenario 4: Idempotent/concurrent start
- **Given** repeated or concurrent starts with the same user/client or active day
- **When** the operations race
- **Then** the repository returns one authoritative session and never creates duplicate active sessions.

## Automated Verification

```bash
npm run typecheck
npm test
npx drizzle-kit check
```

Targeted evidence also includes the repository integration suite with the local app-role `DATABASE_URL` and the existing RLS/tenancy suites.

## GitHub CLI Recipe

```bash
gh issue create \
  --title "refactor(m2): review and commit runtime repository foundation" \
  --body-file docs/tasks/m2/M2-00-runtime-repository-foundation.md \
  --label "area:backend,area:auth,type:refactor,priority:p0" \
  --milestone "M2: Core Domain Engine"
```
