### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2, §5
- **Architectural Decision (ADR)**: `docs/adrs/0002-supabase-auth-over-clerk.md`, `docs/adrs/0003-rls-defense-in-depth.md`
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — Layer 1 authorization depends on this)
- **Labels**: `area:auth`
- **Depends on**: M1-02

---

## User Story & Context

**As a** developer implementing the authoritative authorization layer
**I want** Supabase's SSR middleware wired into Next.js, plus a `requireUser()` helper that resolves the session server-side and returns `user.id`
**So that** no handler ever reads a user id from a request body or query param — this is ADR-0003's Layer 1, and per Amendment A1.2, it's now the *only* legitimate source of the user id anywhere in the app, since application code is never allowed to call `auth.uid()` directly.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **Services / Handlers**: `middleware.ts` (Next.js root middleware), `lib/auth/require-user.ts`, `lib/supabase/server.ts` (SSR client factory)
- No route handlers yet — those are M1-16 (tests) and M2 (implementation)

### Non-Negotiable Invariants
- [ ] **`requireUser()` resolves the session via the SSR server client's `auth.getUser()`**, never by decoding a JWT from a cookie manually and never by trusting a client-supplied value
- [ ] **Session held in `HttpOnly` / `SameSite=Lax` cookies**, refreshed in middleware — per spec §5 Security Audit. No token ever enters `localStorage`, which spec §5 explicitly calls out as the habit to break from the legacy app
- [ ] `requireUser()` throws or returns a typed error result (matching the `AppError` envelope from M1-15) when no session exists — callers must handle the unauthenticated case explicitly, not get `undefined` silently
- [ ] `requireUser()`'s returned `userId` is the *only* value passed as the first argument to any future repository method (ADR-0003 invariant 5) — this task doesn't build repository methods, but this is the contract they'll be held to

### Out of Scope
- Magic-link sign-in flow and `/auth/confirm` (M1-13)
- Custom SMTP (M1-14)
- Any repository method or route handler that calls `requireUser()` (M2, though M1-16's tests will assert against handlers that don't exist yet — RED phase)

---

## Implementation Tasks
- [ ] 1. Install and configure `@supabase/ssr`
- [ ] 2. Write `lib/supabase/server.ts` — server client factory reading cookies via Next.js's `cookies()` API
- [ ] 3. Write `middleware.ts` — refreshes the session on every request, matching Supabase's documented SSR middleware pattern
- [ ] 4. Write `requireUser()` in `lib/auth/require-user.ts` — calls `auth.getUser()`, returns `{ userId: string }` on success or throws/returns a typed `AppError` (401) on failure
- [ ] 5. Write a test using a real GoTrue-issued session cookie (via the admin API + password grant, same technique as the M0 spike) confirming `requireUser()` returns the correct `userId`
- [ ] 6. Write a test confirming `requireUser()` fails cleanly (401-shaped error) when no session cookie is present

---

## Acceptance Criteria

### Scenario 1: Happy path — authenticated request resolves the correct user
- **Given** a valid Supabase session cookie for user A (obtained via a real sign-in, not synthesized)
- **When** `requireUser()` is called within a request context carrying that cookie
- **Then** it returns `{ userId: A.id }`, matching the `sub` claim GoTrue issued

### Scenario 2: Negative — no session
- **Given** a request with no session cookie
- **When** `requireUser()` is called
- **Then** it returns/throws a 401-shaped `AppError`, never `undefined` or a value that could be mistaken for a valid user id

### Scenario 3: Negative — cannot be spoofed via request body
- **Given** a request carries a valid session for user A but a JSON body containing `{ "userId": "<B's id>" }`
- **When** `requireUser()` is called
- **Then** it still resolves to A's id — this test exists specifically to prove the body value is never consulted, closing the exact hole spec §4.2 names ("never read a user id from a request body")

### Scenario 4: No `localStorage` involvement
- **Given** the SSR client configuration
- **When** inspecting the client/cookie setup code
- **Then** no code path writes the session token to `localStorage` — verified by code review against the Security Audit requirement, since this can't be asserted by a unit test alone

---

## Automated Verification Command
```bash
npx vitest run tests/integration/require-user.test.ts
```
