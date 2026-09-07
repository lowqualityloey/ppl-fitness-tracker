### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.3, §5
- **Architectural Decision (ADR)**: `docs/adrs/0002-supabase-auth-over-clerk.md`
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — no user can sign in without this)
- **Labels**: `area:auth`
- **Depends on**: M1-12

---

## User Story & Context

**As a** returning user
**I want** to sign in via an emailed magic link, landing on `/auth/confirm` which exchanges the token and redirects me back into the app
**So that** I never need to manage a password, matching ADR-0002's decision to use Supabase Auth's `signInWithOtp` instead of the originally-requested Clerk.

Spec §5 flags the `/auth/confirm` `next` redirect parameter as "a classic open-redirect sink" — this task is where that gets closed, not left as a TODO.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- **API Endpoints**: `GET /auth/confirm` (token exchange), sign-in form/page (wherever the UI for entering an email lives — minimal, unstyled is fine for M1; M3 applies design tokens)
- **Services / Handlers**: `lib/auth/redirect-allowlist.ts` (or equivalent)

### Non-Negotiable Invariants
- [ ] **`next` param validated against an allowlist of relative paths** — per spec §5's explicit callout. Reject (or default to `/`) any `next` value that isn't a known relative in-app path: no protocol-relative URLs (`//evil.com`), no absolute URLs, no `javascript:` scheme
- [ ] `/auth/confirm` sets the session cookie via the SSR server client (M1-12's `lib/supabase/server.ts`), not manually
- [ ] Sign-in form has its own per-IP rate limit, pairing with (not replacing) Supabase's own OTP endpoint limits — per spec §5 "Auth rate limits" callout
- [ ] No password field anywhere in this flow — email-only per ADR-0002

### Out of Scope
- Custom SMTP provisioning (M1-14) — this task can be built and tested against Supabase's default 2/hour sender for now, with the custom SMTP swap happening in M1-14 without changing this task's code
- Sign-out (`POST /auth/signout`) — small enough to fold into this task if time allows, but not a blocking dependency for anything else in M1; split out as a follow-up issue if it doesn't fit
- Styling of the sign-in page (M3)

---

## Implementation Tasks
- [ ] 1. Build the sign-in form calling `supabase.auth.signInWithOtp({ email })`
- [ ] 2. Build `/auth/confirm` route handler: extract `token_hash` and `type` from the query string, validate both with Zod (per spec §5 "Input validation" — the callback's params are named explicitly as needing Zod coverage), exchange via `verifyOtp`
- [ ] 3. Write the redirect allowlist: a fixed list (or pattern) of valid in-app relative paths; anything else falls back to `/`
- [ ] 4. Wire per-IP rate limiting on the sign-in form submission endpoint
- [ ] 5. Write an integration test performing a real magic-link round trip against the local Supabase stack (request OTP via admin API or by reading the local Inbucket/Mailpit capture, extract the token, hit `/auth/confirm`, assert a valid session cookie is set)
- [ ] 6. Write the open-redirect test

---

## Acceptance Criteria

### Scenario 1: Happy path — full magic-link round trip
- **Given** a registered email address
- **When** the sign-in form is submitted, the resulting email is captured (local Mailpit/Inbucket), and its link is followed
- **Then** `/auth/confirm` exchanges the token and the user lands on the default redirect with a valid session cookie set

### Scenario 2: Negative — open redirect rejected
- **Given** a crafted `/auth/confirm?...&next=https://evil.example.com` (or `next=//evil.example.com`)
- **When** the confirm handler processes the request
- **Then** the redirect target falls back to the default in-app path, never to the attacker-controlled URL

### Scenario 3: Negative — malformed token params
- **Given** `/auth/confirm` is hit with a missing or malformed `token_hash`
- **When** Zod validation runs
- **Then** it returns a 400-shaped error via the `AppError` envelope (M1-15), not a raw stack trace or an unhandled exception

### Scenario 4: Rate limiting
- **Given** repeated sign-in form submissions from the same IP within a short window
- **When** the limit is exceeded
- **Then** further attempts are rejected with a 429-shaped response, distinct from Supabase's own OTP endpoint limit (both should be independently verifiable)

---

## Automated Verification Command
```bash
npx vitest run tests/integration/auth-confirm.test.ts tests/integration/auth-redirect-allowlist.test.ts
```
