# Spec: Magic-link deliverability monitor (#16)

<a id="PLAN-smtp-synthetic-monitor"></a>

**Status**: Approved for implementation - Level 2 (Controlled Work) because the deliverability monitor touches the auth sign-in path, the production release gate B2, and CI wiring.
**Date**: 2026-11-25
**Ceremony**: Level 2 - Planning Record + Task Record, unit tests on the pure parsers, one commit on `main`.
**Supersedes**: none.
**External reference**: `https://github.com/lowqualityloey/ppl-fitness-tracker/issues/16` - "Custom SMTP + synthetic magic-link monitor"
**Scope**: `scripts/check-magic-link.ts`, `tests/unit/scripts/check-magic-link.test.ts`, `package.json`, `.github/workflows/magic-link-monitor.yml`, `docs/STATE.md`. No application source changes: GoTrue sends the mail, so the defect this catches is configuration and infrastructure, not code.

---

## 1. Outcome

Issue #16 asks for three things that local work can honestly deliver now, and one that it cannot. This Planning Record splits them.

1. A monitor exists that completes a **real round trip**: it asks the running app for a magic link, reads the delivered message out of the mail transport, extracts the `/auth/confirm` link from the rendered HTML, follows it, and asserts a session was issued - plus asserts the same link is rejected on replay.
2. The monitor fails the run on any break in that chain. It never treats an HTTP 200 from the sign-in endpoint as delivery, because `src/app/auth/signin/route.ts:39` returns `ok: true` unconditionally: GoTrue errors are swallowed so that sign-in cannot be used to enumerate accounts. A check reading that status would be green through a total mail outage.
3. The target is configuration, not code: `MONITOR_BASE_URL` and `MONITOR_MAILPIT_URL` default to the local stack and can point at a deployed origin later without editing the monitor. The user chose the local path so this is ready, not so it is production-proven.
4. The monitor runs hourly from a scheduled workflow whose non-zero exit fails the job - a failed scheduled job is the alert surface issue #16 accepts.
5. `supabase/config.toml` stays on `[local_smtp]` with `[auth.email.smtp]` commented out, and `email_sent = 2` stays the observed value. The monitor **reports** that value instead of pretending the limit was tuned: tuning needs a real provider account, which needs owner-supplied credentials.

The failure mode all of this exists to prevent: the app looks healthy, sign-in returns 200, and nobody can sign in because the mail never arrives.

## 2. Explicit non-goals

- **Choosing Resend / Postmark / SES.** Issue #16 forbids spiking the provider. Rejected: any of the three satisfies the requirement, and the choice needs an account the agent cannot create.
- **Verifying a sending domain, SPF, or DKIM.** Rejected: needs DNS control for a real domain and a provider account. The monitor accepts whatever transport `MONITOR_MAILPIT_URL` points at; production SPF/DKIM is proven by the same run once a provider is configured, not by a different script.
- **Uncommenting `[auth.email.smtp]` with placeholder values.** Rejected: `supabase/config.toml:237` holds the CLI scaffold default (`smtp.sendgrid.net`), which was never a decision. Pushing it would ship a half-configured sender that fails more confusingly than no sender.
- **Tuning Supabase Auth rate limits.** Rejected for this commit: the hosted limits are set in the dashboard for a project the monitor cannot authenticate against. `email_sent = 2` is recorded, and raising it is an owner action paired with the provider choice.
- **A production alerting integration (PagerDuty, Slack, Opsgenie).** Issue #16 declares it out of scope and accepts a failed CI job as the alert.
- **Making `/auth/confirm` or the sign-in flow stricter.** Rejected: that is M1-13 and already shipped.
- **Adding a mock that simulates mail delivery in the existing Playwright suite.** Rejected: `tests/e2e/auth.ts` states a mock "pretending to be that flow" is exactly what must not be written.
- **A browser-driven E2E of the magic link.** Rejected: the monitor proves issuance and redemption over HTTP, which is the part that breaks. Adding Playwright here would duplicate the assertion at 30x the cost and still not check delivery.

## 3. Decisions

| ID | Decision | Rationale |
| --- | --- | --- |
| D1 | One exit-coded CLI, `scripts/check-magic-link.ts`, with its pure parsing and verdict logic exported | Matches `scripts/check-hosted-rotation.ts`: the file is unit-testable only if the decisions live in exported functions and `main()` only does I/O. |
| D2 | Drive the app's own `POST /auth/signin`, not GoTrue's `/auth/v1/otp` | The app route is the path a person uses. It builds the redirect with `confirmUrl()` from `lib/auth/magic-link.ts`, which is what puts `/auth/confirm` in the link. Hand-calling `/auth/v1/otp` needs `redirect_to` as a **query parameter** - in the JSON body it is silently ignored and the link loses its path - so a GoTrue-level monitor would test a shape the app never produces. |
| D3 | Assert redemption by following the link, not by calling `/auth/v1/verify` directly | Following the link exercises `src/app/auth/confirm/route.ts`, the redirect allowlist, and cookie issuance. Calling verify directly would pass while `/auth/confirm` was broken. |
| D4 | Replay the same link and require rejection | A monitor that only checks the happy path cannot distinguish "the link worked" from "a stale link works". `/auth/v1/verify` answers `403 otp_expired` on replay; the app route answers `303` to `/sign-in?error=link-invalid-or-expired`. Asserting the second call is what proves single use. |
| D5 | Read Mailpit's HTTP API, not SMTP and not a file | `GET /api/v1/messages?limit=50` then `GET /api/v1/message/{ID}` returns the rendered `HTML` and `Text`. Parsing the HTTP body means the monitor validates the actual template output rather than a copy of it. |
| D6 | Match messages by recipient address plus a per-run marker in the address | Mailpit is shared and may hold earlier mail. Using a fixed address would let the monitor read yesterday's message and pass. The monitor mints a unique `synthetic+<runid>@` address per run and only accepts a message addressed to it. |
| D7 | Provision the synthetic user through the Admin API, idempotently | A round trip needs an existing account. `POST /auth/v1/admin/users` with `email_confirm: true` and **no password** creates it (probed: the Admin API answers `200` for a passwordless body, so the monitor never invents a throwaway credential); a `422` for an already-created address is treated as success. This is the only place the monitor needs `SUPABASE_SERVICE_ROLE_KEY`, and it never prints it - the workflow sources the key from `supabase status -o env` rather than carrying a JWT literal. |
| D8 | Volume checking (`--volume N`) is opt-in, not part of the hourly run | The default hourly run must stay one message: `email_sent = 2` per hour is the defect under test, and a monitor that itself sends three messages per hour would mask it. `--volume 3` proves the >2/hour scenario (acceptance scenario 2) on demand, staying under the app's own 5-per-10-minute limiter. |
| D9 | The hourly workflow runs the local stack; the target stays an env var | Nothing is deployed (B1 protection, B2 mail) so there is no production origin to hit. The workflow proves the monitor runs green hourly in CI against the same compose stack the test job uses, and re-pointing is `MONITOR_BASE_URL`. |
| D10 | The monitor uses its own `x-vercel-forwarded-for` value per run | `lib/auth/rate-limit.ts:50` buckets on `clientIp()`, and locally every request without that header shares the `unknown` bucket at 5 requests / 10 minutes. Without a per-run value, three consecutive local verifications would return `429` and read as a mail failure. A `429` is reported as its own verdict, never as success. |

### 3.1 The verdict this monitor must be able to reach

```ts
export type MonitorStatus =
  | 'ok'                 // link delivered, redeemed, and single-use
  | 'app-unreachable'    // POST /auth/signin did not answer
  | 'rate-limited'       // 429 from the app's sign-in limiter
  | 'no-message'         // the app answered, but no mail arrived for this run
  | 'link-unparseable'   // mail arrived, but no /auth/confirm?token_hash= link in it
  | 'redeem-failed'      // following the link did not produce a session
  | 'replay-accepted'    // the same link worked twice - single use is broken
```

## 4. Measured baseline

| Fact | Value | How measured |
| --- | --- | --- |
| Repository HEAD at planning time | `0985c5bcf39022712c1a6b35c1b6da41fee074be` | `git log -1 --format='%H %s'` |
| Sign-in endpoint always answers 200 | `src/app/auth/signin/route.ts:39` `ok: true` with errors swallowed | `read` of the 42-line route |
| Sign-in endpoint rate limit | 5 requests / 600 000 ms per bucket, `lib/auth/rate-limit.ts:50` | `read` of `lib/auth/rate-limit.ts` |
| Mail transport | `supabase/config.toml:104` `[local_smtp]` enabled, Mailpit web UI on port 54324 | `grep -n` on `supabase/config.toml` |
| Production SMTP | `supabase/config.toml:235` `# [auth.email.smtp]` - commented out; scaffold values name SendGrid, never a decision | `grep -n` on `supabase/config.toml` |
| Hourly send cap still at the forbidden default | `supabase/config.toml:197` `email_sent = 2` | `grep -n` on `supabase/config.toml` |
| Link shape in the delivered mail | `http://127.0.0.1:3001/auth/confirm?token_hash=<pkce_ + 56 hex>&type=email` | probe run against the live local stack, 2026-11-26 |
| Why the token carries a `pkce_` prefix | `@supabase/ssr`'s `createServerClient` hardcodes `flowType: 'pkce'`, so every `signInWithOtp` posts a `code_challenge` and GoTrue mints a PKCE-shaped token. Proved: `POST /auth/v1/verify` with body exactly `{type, token_hash}` accepts a 61-char `pkce_` token and returns `200`. The 56-hex assumption in section 5 below was written before this was measured and is corrected in place | probe `/tmp/probe-pkce.mjs`, 2026-11-26 |
| `/auth/v1/verify` accepts only `{type, token_hash}` | `redirect_to` in the body returns `400 validation_failed`: "Only the token_hash and type should be provided" | probe run against the live local stack |
| Replay of a redeemed link | `403` `{"error_code":"otp_expired"}` | probe run against the live local stack |
| Scheduled workflows in the repository | none - `.github/workflows/` holds only `governance.yml` and `test.yml` | `ls .github/workflows/` |
| Existing monitor | none - no script matches `magic` in `scripts/` | `ls scripts/` |

### 4.1 Why the existing E2E cannot prove this

`tests/e2e/auth.ts` signs in by minting a session with `createTestSession` and installing `@supabase/ssr` cookies directly. Its own doc comment says the browser path "needs a mailbox to read the magic link from (GoTrue sends mail; no SMTP is configured, which is exactly deferred issue #16)" and that a spec walking the magic link belongs with #16 once mail can be delivered. Two consequences:

- The E2E suite cannot go red for a mail outage. Every test after sign-in passes with delivery completely broken.
- A monitor built as a Playwright spec would inherit that blindness unless it read the mailbox anyway - at which point the browser adds nothing the HTTP round trip does not already assert.

## 5. Steps

### S0. Write the records before the code

This Planning Record and `docs/tasks/2026-11-25-smtp-synthetic-monitor.md` land in the **same commit** as the script. Split across two commits and `.promptkit/scripts/validate-references.sh --strict` emits `INVALID_LINK|...|Missing PLAN link target or anchor` for the run in between.

### S1. `scripts/check-magic-link.ts` - pure core

Exports, with no I/O:

- `parseConfirmLink(html: string, text: string): string | null` - finds the first `/auth/confirm?token_hash=...&type=email` URL, preferring `html` then `text`. Anchored on the template at `supabase/templates/magic-link.html:5`, whose `&` arrives HTML-escaped as `&amp;` in `html` and plain in `text`.
- `tokenHashFromLink(link: string): string | null` - returns the `token_hash` (56 hex, optionally behind a `pkce_` prefix - see the corrected row in section 4), rejecting `type` values other than `email`.
- `pickMessage(messages, address): MailRef | null` - newest message whose `To` contains `address`.
- `verdict(facts): { status: MonitorStatus; reason: string }` - the pure decision table behind §3.1.

`main()` does all HTTP and prints one aligned line per phase, in the style of `scripts/check-hosted-rotation.ts`:

```text
  ok    provision  synthetic account ready
  ok    request    POST /auth/signin answered 200
  ok    deliver    message <ID> arrived after 214 ms
  ok    parse      token_hash pkce_a1b2... (61 chars)
  ok    redeem     303 -> / with session cookie
  ok    replay     303 -> /sign-in?error=link-invalid-or-expired
  PASS  magic-link round trip completed in 1.4 s
```

Exit codes: `0` round trip proven, `1` round trip broken (the alert), `2` missing or malformed configuration.

### S2. `tests/unit/scripts/check-magic-link.test.ts`

Follows `tests/unit/scripts/build-sw-manifest.test.ts`: imports the exported functions and asserts behaviour, no network, no mocks of the transport. The suite must cover the **red** verdicts as thoroughly as the green one, because a monitor that cannot return `no-message` or `replay-accepted` is decorative. Includes the exact escaped-`&amp;` case from the real template and a negative case where the message carries an unrelated link (a tracker URL) that must not be mistaken for the confirm link.

### S3. `package.json` script

`monitor:magic-link`, using the same `node --env-file-if-exists` + `tsx` invocation as every other script in the file, so it picks up local configuration exactly like `npm run test:api`.

### S4. `.github/workflows/magic-link-monitor.yml`

`schedule: cron '17 * * * *'` (offset from the hour so it does not contend with any other job) plus `workflow_dispatch`. `permissions: contents: read`. Steps: checkout, `npx supabase start` (mailpit included - the monitor is meaningless without it), build and start the app on 3001, wait for `/api/health`, run `npm run monitor:magic-link`, upload the log with `if: always()`. A non-zero exit fails the job, and the failure notification is the alert issue #16 accepts.

### S5. Prove the gate can go red

Two proofs, both recorded in the Task Record:

1. `MONITOR_MAILPIT_URL=http://127.0.0.1:1 npm run monitor:magic-link` exits `1` with `no-message` - the app answered, mail was read from nothing.
2. `--volume 3` exits `0` with three delivered messages, showing the `email_sent = 2` cap is not hit locally while still being reported.

### S6. Record the residual owner action

`docs/STATE.md` §5 blocker table: B2 keeps `OPEN`, but its text changes from "no monitor exists" to naming exactly what remains - a provider account, a verified domain with SPF/DKIM, and the Auth rate-limit tuning - each an owner action. The monitor is cited as the instrument that will prove the change. §7's queued action gets the same split.

### S7. Verify and commit

`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:api`, plus the two live monitor runs from S5. One commit on `main`.

## 6. Acceptance criteria

| ID | Criterion | How it is proved |
| --- | --- | --- |
| AC-1 | A delivered magic link is parsed into its `token_hash` and `type` | Unit test over the exact HTML the template produces, including `&amp;` |
| AC-2 | A message with only unrelated links yields `link-unparseable`, never a false pass | Unit test with a tracker URL in the body |
| AC-3 | A missing message yields `no-message` | Unit test on the verdict table, plus live run S5.1 |
| AC-4 | A second redemption of the same link is detected as `replay-accepted` | Unit test on the verdict table; live run asserts the real replay is rejected |
| AC-5 | The monitor completes a real round trip against the local stack | Live run exits `0` with the phase lines of S1 |
| AC-6 | An HTTP 200 from sign-in alone never yields `ok` | Unit test: `verdict` with `delivered: false` and `requestStatus: 200` returns `no-message` |
| AC-7 | More than 2 messages in one hour are all delivered locally | `--volume 3` exits `0` |
| AC-8 | The hourly workflow exists, is scheduled, and fails the job on a red run | `magic-link-monitor.yml` read back; `grep -n 'cron'` |
| AC-9 | `email_sent = 2` is reported as an open owner action, not silently accepted | `docs/STATE.md` §5 B2 row names the rate-limit tuning as outstanding |
| AC-10 | No new dependency, and no secret is printed | `package.json` diff touches only the script map; monitor output contains no key material |

## 7. Risks, failure modes, and rollback

| Risk | Failure mode | Mitigation |
| --- | --- | --- |
| Monitor passes because it read a stale message | Green while delivery is dead | D6: unique recipient per run; unit test AC-3 |
| Local `unknown` rate bucket exhausts during repeated verification | `429` read as a mail failure | D10: per-run forwarded-for value, and `429` maps to its own `rate-limited` status, never `ok` |
| The hourly CI job drifts from production configuration | Monitor green locally while production is broken | Accepted and stated: the monitor is the instrument, `MONITOR_BASE_URL` is the switch, and STATE.md keeps B2 open until a real run hits a real provider |
| Mailpit API changes shape | Monitor cannot read mail | Only `/api/v1/messages` and `/api/v1/message/{ID}` are used; both are versioned under `api/v1` |
| Scheduled job costs CI minutes | Budget pressure | One job, one hour, single round trip; the job is small and the check is the release gate |

**Rollback**: delete `scripts/check-magic-link.ts`, its test, the workflow, and the `monitor:magic-link` script entry, then revert the STATE.md rows. No application code, schema, or configuration changes are involved, so rollback cannot break sign-in.
