# Technical Design: M1-13 Magic-Link Authentication

- **Author**: Owner + Kiro
- **Status**: Implemented
- **Created**: 2026-09-08
- **Target Release**: M1: Contracts & Seams
- **Issue**: [#15](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/15)

## 1. Problem and scope

The target app has Supabase SSR session handling and verified identity resolution (M1-12), but no way for a user to establish a session. M1-13 adds an email-only magic-link sign-in flow and exchanges its single-use token through `/auth/confirm` without allowing the callback's `next` parameter to become an open redirect.

Success is: a valid local GoTrue magic-link token produces a server-managed SSR session cookie and a redirect to `/`; malformed callback input returns the established error envelope; hostile redirect values can never become a `Location` target; repeated sign-in requests from the same client identity receive a distinct 429 response before GoTrue is called.

### In scope
- Unstyled `/sign-in` page with an email-only form.
- `POST /auth/signin`: input validation, generic anti-enumeration success response, canonical callback construction, and a per-IP sliding-window limiter.
- `GET /auth/confirm`: Zod validation of `token_hash` and `type=email`, `verifyOtp`, SSR cookie persistence, and redirect normalization.
- A fixed redirect allowlist. The app currently has no protected page routes, so `/` is the only accepted destination.
- Minimal shared `AppError` extension for the required 400 and 429 envelopes, ahead of M1-15.
- Local GoTrue config/template wired to the Next app on port 3001.

### Explicit non-goals
- Custom SMTP, sending-domain verification, and delivery monitoring (M1-14).
- Password sign-in, OAuth, sign-out, protected application pages, and M3 styling.
- A multi-region, durable distributed rate-limit provider. The implementation's in-memory limiter is correct within one runtime and testable now; production deployment must replace its storage port with a shared atomic provider before horizontally scaling. This follow-up is a launch-hardening dependency, not a claim that process memory is globally durable.

## 2. Architecture and contracts

```text
Browser form -> POST /auth/signin -> AuthRateLimiter -> Supabase signInWithOtp
     |                                                   |
     |<-- generic success JSON --------------------------+
     |
Email capture -> /auth/confirm?token_hash=...&type=email&next=/
                    -> validate -> SSR createClient -> verifyOtp
                    -> HttpOnly Supabase session cookies -> 303 /
```

| Seam | Contract | Responsibility |
| --- | --- | --- |
| `lib/auth/redirect-allowlist.ts` | `safeRedirectPath(raw: string \| null): '/'` | Reject all but a fixed, same-origin relative allowlist. Never return caller-provided external/query/hash content. |
| `lib/auth/rate-limit.ts` | `check(ip): { allowed, retryAfterSeconds }` | Sliding-window request throttle; no GoTrue/network knowledge. Storage is replaceable. |
| `POST /auth/signin` | `{ ok: true, data: { message } }` / typed 400/429 | Validate email, rate-limit, construct callback from canonical `NEXT_PUBLIC_APP_URL`, initiate OTP without revealing account existence. |
| `GET /auth/confirm` | 303 `/` plus SSR cookies / typed 400 | Validate callback query, call `verifyOtp({ token_hash, type: 'email' })`, and rely only on the M1-12 server client cookie adapter. |

`NEXT_PUBLIC_APP_URL` is the canonical application origin. It must be an absolute `http`/`https` URL and is never derived from `Host`, forwarded headers, or `next`. Local value: `http://127.0.0.1:3001`.

## 3. Validation and error contract

```ts
SignInRequest = { email: z.string().trim().email().max(254) }
ConfirmQuery = {
  token_hash: z.string().min(1).max(2048),
  type: z.literal('email'),
  next: z.string().optional(),
}
```

| Condition | Response | Disclosure policy |
| --- | --- | --- |
| Invalid sign-in body | 400 `VALIDATION_ERROR` | No email value is reflected. |
| Sign-in throttle exhausted | 429 `RATE_LIMITED`, `Retry-After` | The public response does not expose provider state. |
| Valid sign-in request | 200 generic success | Same response for registered and unregistered addresses. |
| Missing/malformed callback token/type | 400 `VALIDATION_ERROR` envelope | No stack trace. |
| Valid-looking but rejected/expired token | 303 `/sign-in?error=link-invalid-or-expired` | Provider error is not placed in URL/body. |
| Valid token | 303 safe internal path | Session only comes from `@supabase/ssr` cookie writes. |

## 4. Security and FMEA

| Failure / threat | Severity | Mitigation | Test / detection |
| --- | --- | --- | --- |
| Open redirect (`https:`, `//`, `javascript:`, unknown path) | Critical | Exact internal allowlist; route uses normalized result only | Unit/integration cases for hostile and encoded inputs |
| Session token exposed to JS storage | Critical | No manual token handling; `verifyOtp` runs through SSR server client | Code review and cookie-backed GoTrue round trip |
| Account enumeration | High | Generic OTP-request success response | Route test checks same success envelope for provider success/failure |
| OTP flooding | High | Per-IP limiter before Supabase call plus GoTrue limits | Deterministic limiter test and 429 envelope |
| Limiter bypass under replicas/restarts | High in production | Storage interface; deployment requires shared atomic backing before horizontal scale | Deployment checklist; M1 process limiter explicitly documented as insufficient for scale |
| Spoofed client IP | High | Treat forwarded IP headers as trusted only when the hosting proxy strips/sets them; local tests inject a known IP | Deployment configuration review |
| Malformed or replayed token | High | Zod query boundary; single-use GoTrue `verifyOtp`; generic invalid-link redirect | Local GoTrue token-hash integration test |
| Mail callback pointed at legacy Vite origin | High | Exact local Auth redirect URL and magic-link template target port 3001 | Local config review and round-trip test |

## 5. Configuration and rollout

No database migration is required. Local Supabase Auth configuration changes are additive and reversible:
1. Set `auth.site_url` and `additional_redirect_urls` to the Next origin/callback on port 3001.
2. Add the local magic-link template that sends `TokenHash` to `${NEXT_PUBLIC_APP_URL}/auth/confirm?token_hash=...&type=email`.
3. Add `NEXT_PUBLIC_APP_URL` to `.env.example` and local/CI environment.
4. Deploy only after the deployed application origin is added as an exact hosted Supabase redirect URL.

Rollback: remove the new route/page deployment or revert the configuration entry; no persisted application data changes.

## 6. Test plan

- `tests/integration/auth-redirect-allowlist.test.ts`: `/` accepted; missing, blank, unknown, absolute, protocol-relative, JavaScript, encoded, query, and hash inputs default to `/`.
- `tests/integration/auth-confirm.test.ts`: local GoTrue token-hash verification writes real SSR cookies to a test jar, validates the authenticated user via `requireUser`, and rejects malformed inputs with a typed 400 envelope.
- Sign-in endpoint coverage: validates email, supplies a canonical callback URL, returns generic success, and produces an independently asserted 429 after the configured window is exhausted.
- Full suite, typecheck, targeted lint, `check-set-config`, and CI are required before merge.

## 7. Implementation sequence

1. Add exact-pinned Zod and minimally extend the shared envelope with `VALIDATION_ERROR` and `RATE_LIMITED`.
2. Add pure allowlist and rate-limiter modules with tests.
3. Add sign-in route/page and confirmation handler using the existing SSR client.
4. Update local Supabase URL/template configuration and add real-GoTrue token-hash session coverage.
5. Before production scale, bind the limiter storage port to a shared provider and configure trusted-proxy IP extraction.
