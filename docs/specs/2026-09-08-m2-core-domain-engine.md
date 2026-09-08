# Technical Design Document (RFC): M2 Core Domain Engine

- **Author**: Owner + Kiro
- **Status**: Approved for execution (retroactive formalization)
- **Created**: 2026-09-08
- **Last Revised**: 2026-09-08
- **Related RFC**: `docs/specs/2026-09-08-spec-fullstack-migration.md`
- **Target Release**: v1.0.0 — Milestone M2

## 1. Executive Summary & Problem Statement

M1 delivered the target application's schema, RLS policies, seeds, verified Supabase authentication, canonical Zod contracts, and the intentionally failing HTTP route baseline. M2 turns those seams into a server-authoritative domain engine without disturbing the legacy static application. The first slice, M2-00, already provides the runtime Drizzle client, verified auth-to-RLS transaction context, session domain mappers, and a user-scoped `WorkoutRepository`; this RFC formalizes that work and sequences the remaining implementation.

The immediate user outcome is durable workout-session history: an authenticated user can list prior sessions, start a session idempotently, retrieve its full state, and receive no data from another user. Later M2 slices add the lifecycle state machine, progression/PR materialization, offline sync, and honest legacy import. M2 deliberately stops before presentation/UI migration; M3 owns the interactive session runner and design system.

## 2. Goals, Success Metrics, and Non-Goals

### Goals

1. **Authenticated session history**: `GET /api/sessions` returns a cursor-paginated, domain-mapped history scoped to the verified user.
2. **Idempotent session start**: repeated `POST /api/sessions` requests with the same `(userId, clientId)` return the same session; concurrent active-day starts cannot fork a session.
3. **Full session state**: `GET /api/sessions/:id` returns the routine plan, sets, and tasks through repository/domain mappers.
4. **Authoritative lifecycle**: M2-02 provides legal phase transitions, set/task mutation semantics, completion, and rollback-safe transactions.
5. **Progression integrity**: M2-03 computes e1RM/PR materialization only from committed set writes.
6. **Sync correctness**: M2-04 provides bounded, idempotent mutation application and a formally designed sequence/change model before claiming true `since` deltas or device-aware LWW.
7. **Honest import**: M2-05 preserves all recoverable legacy data, reports known pull-day loss, and is fingerprint-idempotent.
8. **Security**: zero cross-user disclosure in app-role integration tests; every route derives identity from verified Auth and uses explicit user scoping plus PostgreSQL RLS.

### Success metrics and gates

| Metric | M2 gate |
| :--- | :--- |
| Session API contract | All six M2-01 HTTP scenarios pass, including idempotent replay and cross-user 404 |
| Tenant isolation | Cross-user reads return zero/404 through the non-owner `app_authenticated` role; no owner-role runtime path |
| Validation | `npm run typecheck`, targeted lint, repository/unit tests, and API integration tests pass |
| Regression | Existing non-RED suite remains green; legacy source folders and behavior are unchanged |
| Sync SLA design | M2-04 documents sequence, device metadata, conflict tie-break, and rollback tests before implementation claims true deltas |
| Import honesty | Import report identifies unrecoverable pull-day set detail instead of fabricating rows |

### Explicit non-goals

- No deletion, move, rewrite, or decommissioning of `push-day-workout/`, `pull-day-workout/`, `legs-day-workout/`, `ppl-workout-dashboard/`, root `index.html`, or root `vite.config.js`.
- No M3 UI, shadcn setup, Tailwind token work, session runner, IndexedDB outbox, or accessibility redesign.
- No custom SMTP/provider/DNS work; issue #16 remains a separate M1 production-release blocker.
- No true `since` delta implementation until a persisted change-log/sequence model exists.
- No persisted `deviceId` or LWW tie-break implementation until the schema and transaction semantics are designed.
- No nutrition, social, coach/team, wearable, or routine-builder features.
- No service-role or migration-owner connection in request-path runtime code.

## 3. System Context and Deep Module Boundaries

```text
Supabase SSR cookie
        │
        ▼
Next.js Route Handler
  ├─ Zod boundary parse
  ├─ requireUserContext() ── verified auth.getUser()
  ├─ WorkoutRepository(userId first, claims)
  └─ canonical AppEnvelope response
        │
        ▼
withUser() transaction-local JWT claims
  ├─ blank request.jwt.claim.sub
  ├─ set request.jwt.claims with is_local=true
  └─ Drizzle using DATABASE_URL / app_authenticated
        │
        ▼
PostgreSQL schema + RLS + constraints
```

| Module | Public interface | Responsibility and test seam |
| :--- | :--- | :--- |
| `requireUserContext` | `Promise<VerifiedUserContext>` | Verified Supabase identity; no request identity input. Unit/integration auth tests. |
| `withUser` | `(db, claims, operation)` | Transaction-local RLS claim setup, including both GUCs and `is_local=true`. GUC regression tests. |
| `WorkoutRepository` | `listSessions(userId, cursor?)`, `findSession(userId, id)`, `findByClientId(userId, clientId)`, `startSession(userId, routineDayId, clientId, localDate)` | Single user-scoped persistence seam, cursor paging, hydration, idempotent/concurrent start. App-role repository tests. |
| `SessionEngine` | `start`, `completeSet`, `advancePhase`, `finish` | Deep lifecycle module: legal transitions, phase gates, task/set rules, atomic writes. Pure transition tests plus DB transaction tests. |
| `ProgressionEngine` | `calculateE1rm`, `materializePersonalRecord` | e1RM and PR policy, committed-write fan-out. Pure math plus transaction tests. |
| `SyncEngine` server path | bounded mutation batch application | Mutation ledger, sequence/change model, conflict policy, authoritative state. Reducer, concurrency, rollback, and HTTP tests. |
| `LegacyImporter` | `import(raw) -> ImportReport` | Per-key parsing, fingerprint idempotency, archive/report semantics. Parser/property and DB integration tests. |

The deletion test is applied to each module: a module remains only when it concentrates domain complexity or enforces a security/transaction boundary. Route handlers are intentionally thin adapters; they do not duplicate repository queries or expose Drizzle rows.

## 4. Domain and Persistence Design

### 4.1 Existing session graph

M2-01 consumes the existing schema without a destructive migration:

- `workout_sessions`: owner, routine day, client id, status, phase, source, local date, timestamps, and current `server_seq`.
- `session_sets`: owner, session, exercise, natural set key, completion, nullable kg/reps, client timestamp, and sanity checks.
- `session_tasks`: session/task natural key and completion metadata; ownership is derived through the parent session.
- `personal_records`: one materialized record per `(userId, exerciseId)`.
- `sync_mutations`: future mutation idempotency ledger.
- `import_batches`: future `(userId, sourceFingerprint)` import ledger/report.

The database constraints remain authoritative for duplicate client ids, one active session per user/day/routine, natural set/task keys, and numeric bounds. Content tables are system-seeded and readable through their existing RLS policies.

### 4.2 M2-00 runtime and authorization invariants

1. Request-path database code reads `DATABASE_URL` only. `MIGRATION_DATABASE_URL` is owner-only for migrations, seeds, metadata, and bounded fixture setup.
2. `requireUserContext()` calls verified Supabase `auth.getUser()` and creates claims with `claims.sub === userId`.
3. Repository methods take `userId` as the first argument and assert the claims/user match before `withUser()`.
4. `withUser()` sets both `request.jwt.claim.sub` to blank and `request.jwt.claims` transaction-locally with `is_local=true`.
5. The app role is `app_authenticated`, non-owner, `NOBYPASSRLS`; every query has an explicit user predicate where the table carries ownership.
6. Route responses expose mapped domain objects only, never raw Drizzle rows or database error details.

### 4.3 Schema evolution

M2-00 and M2-01 require no schema migration. Any M2-04 change for change logs, device metadata, sequence width, or conflict records follows Expand → Backfill/Read-Switch → Contract:

1. **Expand**: add nullable/new tables and indexes; keep current `server_seq` reads/writes compatible.
2. **Backfill/read switch**: populate historical metadata in bounded batches; dual-read/dual-write only while both deployed code versions are safe.
3. **Contract**: remove obsolete columns/paths in a later migration after verification and rollback-window expiry.

No migration may repair the known `0004`/`0005` Drizzle journal mismatch implicitly; reconcile metadata as a separately reviewed data task before relying on generated migrations.

## 5. API Contracts and Route Behavior

The M1 contracts remain the external source of truth in `lib/contracts/sessions.ts`.

| Method | Path | M2 behavior | Errors |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/sessions?cursor=` | Parse strict query, require verified user, return 20-item keyset page and opaque `nextCursor`. | 401 unauthenticated, 400 invalid cursor, 500 generic internal error. |
| `POST` | `/api/sessions` | Parse strict JSON `{ routineDayId, clientId }`, derive local date at the current boundary, idempotently start/find through repository. | 400 malformed/invalid UUID, 401 unauthenticated, 409 unresolved active-day conflict, 500 generic internal error. |
| `GET` | `/api/sessions/:id?since=` | Parse UUID and nonnegative sequence. Return mapped full state in M2-01; accept `since` for contract compatibility only. | 400 invalid id/sequence, 401 unauthenticated, 404 inaccessible/missing, 500 generic internal error. |

The `since` parameter is intentionally parsed but not interpreted as a delta in M2-01. M2-04 must not be marked complete until a persisted sequence/change model can reconstruct changes or explicitly returns a documented full-state fallback.

Every handler returns `{ ok: true, data }` or `{ ok: false, error }` and uses the error's HTTP status. `AppErrorException` maps directly; Zod failures map to `VALIDATION_ERROR`; missing repository state maps to `NOT_FOUND`; known start races map to `CONFLICT`; unexpected failures map to `INTERNAL_ERROR` without stack/SQL disclosure.

## 6. Deterministic Fixture Strategy

M2-01 API tests retain real SSR cookie authentication but add an owner-role fixture layer for bounded setup/cleanup:

1. Create an Auth user through the local Supabase admin endpoint and sign in through the existing cookie jar.
2. Use `MIGRATION_DATABASE_URL` only inside test fixture setup to insert deterministic content/session graph rows and clean them in dependency order.
3. Run HTTP requests without a request-provided user id; the route must derive identity from the cookie.
4. Create a second Auth user and a session owned by that user for the cross-user 404 case.
5. Delete session children, sessions, profiles/domain rows as required, then Auth users; do not assume the missing `profiles.id → auth.users.id` physical FK performs cleanup.
6. Keep fixed UUIDs isolated to the serialized API suite and avoid random data in assertions except Auth email addresses.

Fixture failures must fail loudly. Cleanup must not mask the original test failure and must not use the runtime app role to bypass the behavior under test.

## 7. Security and Resilience FMEA

| Failure mode | Severity | Detection | Mitigation | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Missing/invalid Auth cookie | High | API 401 assertion | `requireUserContext()` before repository access; canonical envelope | Client re-authenticates; no DB query should occur |
| User id supplied by request | Critical | Contract/security review and spoofed-body test | Ignore body/query identity; use verified `claims.sub` only | Reject implementation before merge |
| Cross-user session lookup | Critical | Two-user app-role integration test | Explicit `userId` predicate plus RLS; inaccessible maps to 404 | Investigate and block release |
| Stale pooled JWT GUC | Critical | `with-user` negative-control test and tenancy suite | Blank singular GUC, set claims transaction-locally with `true` | Roll back helper change; rotate pool if needed |
| Runtime uses owner DSN | Critical | Static scan and current_user assertion | `getDb()` reads only `DATABASE_URL`; owner DSN limited to fixtures/migrations | Block merge and remove import |
| Duplicate client start | High | Repeated POST and concurrent repository tests | `(userId, clientId)` unique key and read-before-insert/on-conflict recovery | Return existing authoritative session |
| Active-day race | High | Concurrent start integration test | Partial unique index and conflict recovery | Return existing active session or typed 409 |
| Invalid cursor/sequence/UUID | Medium | Boundary API tests | Strict Zod parse and typed repository cursor error | 400; do not query invalid resource |
| Routine graph missing/hidden | High | Seeded fixture and app-role integration | Content RLS and explicit not-found/internal mapping | Return safe error; repair seed/migration |
| Partial lifecycle write | High | Transaction rollback test | Domain engine operations execute in one transaction | Retry whole mutation; no partial state |
| False `since` delta claim | High | Contract review and sync tests | M2-01 documents full-state behavior; M2-04 owns change log | Do not advertise delta semantics |
| Import data loss | Medium | Import report fixture cases | Per-key parsing and explicit pull-day warning | Preserve raw keys until user accepts archive |

## 8. Test-First Implementation Sequence

### M2-00 — Runtime/repository foundation (implemented locally)

Review and commit the existing client, context, mappers, repository, and focused tests. Its gate is typecheck, unit tests, app-role repository integration, RLS/tenancy tests, static runtime-DSN scan, and diff/secret hygiene.

### M2-01 — Sessions API and deterministic fixtures

Add the owner fixture layer and implement the three session route handlers. First make the existing six RED scenarios deterministic, then add invalid input, invalid cursor, conflict, and RLS isolation coverage. Do not implement lifecycle mutations or true deltas here.

### M2-02 — SessionEngine lifecycle

Define and test a pure transition table, then add repository transaction methods for sets/tasks/phase/finish. Enforce legal transitions, active-session ownership, required work, and rollback behavior. Keep handlers thin and use the same AppError envelope.

### M2-03 — ProgressionEngine

Define the e1RM formula and null/zero policy in pure tests. Materialize/update `personal_records` in the same transaction as set writes and prove rollback does not leave a PR behind.

### M2-04 — Sync server path and conflict model

Before route code, decide the persisted `deviceId` representation, per-row change sequence/change-log shape, server sequence width, clock-skew handling, and deterministic tie-break. Apply max-200 batches transactionally through SessionEngine/ProgressionEngine and `sync_mutations`; test replay, cross-user references, concurrency, rollback, and authoritative state.

### M2-05 — LegacyImporter

Implement independent Zod parsers for the three legacy keys, fingerprint/idempotency through `import_batches`, archive-safe reporting, date confidence, and explicit pull-day loss. Test partial malformed siblings, replay, and transaction behavior.

### M2-06 — Green route baseline and hardening

Turn all M1 route suites green: sessions, sync, exercises, progress, import, and signout. Run security/tenancy/schema-drift gates, pooler claim isolation, race/rollback tests, performance checks, and route error-disclosure review. M2 exits only when the remaining route failures are either green or explicitly tracked as an approved non-goal.

### Dependency graph

```text
M2-00 ──► M2-01 ──► M2-02 ──► M2-03 ──► M2-04 ──► M2-06
                         └──────────────► M2-05 ────────┘
```

M2-03 and M2-05 may be developed in parallel only after M2-02 freezes the session write/archive interfaces. M2-04 cannot be implemented safely before mutation semantics and the sequence/device model are approved.

## 9. Definition of Done

- All relevant Zod contracts and domain types are updated before implementation.
- Every request-path query is user-scoped and runs through `withUser()` under `app_authenticated`.
- No raw rows, SQL, stack traces, secrets, or request-supplied identities cross the API boundary.
- Unit, integration, API, typecheck, lint, schema/RLS, diff, secret, and debug hygiene gates pass for the slice.
- New schema follows Expand-Contract and has RLS/FORCE plus four discrete policies where applicable.
- `docs/tasks/m2/` and GitHub issue numbers match the implementation state in `docs/STATE.md`.
- Legacy source folders remain untouched until M4.

## 10. Sign-off Checklist

- [x] Existing M2-00 architecture and failure modes reviewed.
- [x] M2-01 contract limitation for `since` documented.
- [x] M2-04 sequence/device metadata deferral documented.
- [x] SMTP issue #16 explicitly kept out of M2 critical path.
- [x] Atomic tasks and Gherkin acceptance criteria prepared under `docs/tasks/m2/`.
- [x] GitHub issue numbers recorded: #36–#42 under milestone `M2: Core Domain Engine`.
- [ ] M2-00 reviewed and committed with `pk:commit`.
