> **M4-06** · Telemetry · `#priority/p1` · Derived from: master RFC M4 line ("… **Sentry** …"); handoff §3.2 (telemetry "explicitly not in M3").

## Intent
As the owner of a single-user app that syncs offline data I cannot re-derive, I want thrown defects on **both sides of the wire** to reach one error channel — so a `ContractViolationError` on a producer (new since #73) cannot ship silently to users while every suite reads green.

## Scope
- Server: Next.js error path reports unhandled exceptions (incl. `validateOutgoing` rejections — those are producer defects by design) to the configured transport with the M4-05 correlation id attached.
- Client: the sync island's unhandled rejections and IndexedDB failure modes (`Outbox` quota errors are typed already — report, don't swallow) reach the transport.
- Config: DSN via env; **absent DSN must degrade to a no-op that cannot crash a request or a page** (the repo's own test traps prove how env-shaped assumptions break suites).
- Release/version tagging of events so a 5-slice-old error is attributable.

## Out of scope
Session replay / breadcrumbs beyond defaults; uptime monitoring (#16's synthetic monitor is the M1 story); performance tracing products (M4-01's harness is the measurement tool here).

## Acceptance criteria
```gherkin
Scenario: A thrown error arrives
  Given a test transport injected (not a live Sentry account)
  When a route handler throws and when the client hits a typed outbox failure
  Then exactly one event per error reaches the transport, carrying the correlation id and release tag
  And the observation includes the failure half: with the reporter removed, the spec is watched red

Scenario: No DSN is a supported configuration
  Given DSN unset
  When a defect is thrown on a route and in the runner
  Then the request/page error path completes normally (the original error still surfaces) — telemetry absence never becomes an outage

Scenario: Producer defects are identifiable
  Given a ContractViolationError from POST /api/sync
  When it is reported
  Then the event says so distinctly from a caller 400 — the distinction #73 built (non-Zod throw) must survive into the channel
```

## Implementation record (2026-09-15 — every number measured this pass, against a running server where the claim is about a running server)

**Gates:** `npm run typecheck` 0 · `npm run lint` 0 · `npm run test` **58 files / 547 tests** · `npm run test:api`
**11 files / 65 tests** · `npx playwright test` (battery minus `lighthouse.spec.ts`) **66/66 passed in 3.7 min** ·
`npm run next:build` clean, route table still **19/19 `ƒ`**.

| AC | Result | What was observed |
| :--- | :--- | :--- |
| **1** a thrown error arrives, exactly one, both sides | **green, and observed on the real wire** | Against a local ingest endpoint (no Sentry account, no network beyond loopback): a **browser** defect produced `POST /monitoring?o=…&p=…` from the page — the only cross-request the page made — which Next rewrote to `/api/<project>/envelope` and the sink recorded with `release: m4-06-proof` and the seeded message inside it. A **route handler** that threw produced an event carrying `plane: server, kind: producer, source: GET /auth/confirm`, and its `request_id` tag was **byte-identical to the `request threw` log line's** (`06e6af78-89ac-483d-bf64-642b72bbfdae`) — that equality is G-M4-2's actual claim, not this card's decoration. Exactly-once is asserted in `tests/unit/errors/reporter.test.ts` (the marker is on the error object, so both server seams can stay armed) and re-proven at `route-seams.test.ts`. **Watched red four times**: (a) `loggedRoute` stops reporting → 2 cases red; (b) `routeErrorResponse` stops → 2 red; (c) `Outbox.enqueue` stops → 1 red; (d) `tracesSampleRate: 0.2` smuggled back into the client init → 2 guard cases red. Each mutation run alone and reverted (`cmp` byte-identical afterwards). |
| **2** no DSN is a supported configuration | **green** | `tests/unit/infra/sentry-config.test.ts` asserts `initSentry*()` returns false for `undefined`, `''` and `'   '`, that Sentry's `init` is never reached, and that no transport ends up installed. `tests/e2e/error-sink.spec.ts` runs the same configuration through the real prod server: a seeded unhandled rejection leaves the form typing and posting, and the page reports **exactly one** error — the seed itself, nothing from the reporting path beside it. (That second half is an assertion corrected by measurement: the first draft expected zero page errors, and Chromium surfaces unhandled rejections to the window whatever the SDK does, so "zero" was never this app's to promise.) |
| **3** producer defects are identifiable | **green** | `routeErrorResponse` reports from the one branch that can only be reached by a defect — every caller-facing rejection above it is typed, and `AppErrorException` is thrown solely by `requireUserContext` with a 401 or #125's 503, which is load and not a bug. A `ContractViolationError` therefore arrives as `errorName: 'ContractViolationError'` + `kind: producer`; a real `ZodError` answers 400 and produces nothing at all. The live event carried `kind: producer`, so the distinction survived into the channel and not just the unit test. |
| **Scope: release attribution** | **green, after two measured corrections** | `resolveRelease()` reads `SENTRY_RELEASE` (server) then `NEXT_PUBLIC_SENTRY_RELEASE` (the browser can only see an inlined name). The first real envelope arrived with **`release: null`**: `withSentryConfig`'s build-time `release.name` is what reaches the client bundle, and passing `release: undefined` to `Sentry.init` *overrides* it. Both fixed, and the re-run carried the release on both planes. |
| **Scope: absent DSN degrades to a no-op that cannot crash a request or a page** | **green** | `reportError` cannot throw: a transport that explodes is caught, named once through the logging seam (`error transport threw`, carrying the original defect beside it), and the caller keeps its own error — asserted at `server-report.test.ts` and `reporter.test.ts`. |
| **Out of scope, held** | — | No tracing anywhere (no `tracesSampleRate`, no `tracePropagationTargets`, no `browserTracingIntegration`), asserted textually against both init files *and* against the init options. Source-map upload, `org`, `project` and `SENTRY_AUTH_TOKEN` are absent by design — spec §5.1 reserves that credential for a build pipeline #16 does not have yet. The SDK's "ACTION REQUIRED: export `onRouterTransitionStart`" warning is left standing on purpose: it instruments *navigations*, which is signal, and a guard fails the day someone fixes the warning without reading `DEFERRED-m4-005`. |

### Five things that were only learnable by running it

1. **`sentry.server.config.ts` is not auto-detected.** With the file present, `SENTRY_DSN` set and a route genuinely throwing, the server answered 500 and sent **nothing**: at this pin no built module references that filename. It is imported by Next's `register()` hook, so `src/instrumentation.ts` had to be added. Without it the server half of the sink is a file that exists and never executes.
2. **A module-scoped transport is invisible across Next's bundle graphs.** With the config file wired up, the one event that arrived carried Sentry's own `turbopack: true` tag and **none of ours**: `instrumentation.ts` (which installs the transport) and a route handler run as separate instances of `reporter.ts`, so the handler read its own `null`. Unit tests could not see this — vitest gives them one registry. The slot now lives on `globalThis`, and the server reports **once, in the log**, when a report finds no transport, so the failure mode is diagnosable instead of inferable.
3. **A credential inside a sentence survived redaction.** `scrubString`'s URL rule was anchored to the start of the value, so `verify https://…/verify?access_token=X failed` kept `access_token=X` on the wire — harmless-ish in a log file, not harmless once #95 forwards messages to a third party. Fixed at the predicate (`redact.ts`, one shared rule, red-first test in `tests/unit/infra/log-redaction.test.ts`), not in the reporter, because the reporter bypassing `redact.ts` is the thing that let the hole exist.
4. **The wire spelling of a field had to move.** `wireKey` lived in `logger.ts`, which imports `AsyncLocalStorage` — so a browser-safe module could not use it, and a `requestId` tag beside a `request_id` log line is two spellings of the one id G-M4-2 promises to join. `wireKey` now sits beside `safeKey` in `redact.ts` and `logger.ts` re-exports it; the seam's public surface is unchanged.
5. **The install itself needed a writable npm cache** (`~/.npm` carries root-owned files on this box: `npm view` fails with `EACCES`, `--cache /tmp/npm-cache` works), and **no install script ran** for `@sentry/cli` under the repo's `allowScripts` policy — correct here, since the only thing that needs `sentry-cli` is source-map upload, which is out of scope by §5.1.

### Deviation, recorded

The card's Automated Verification names `session-runner.spec.ts` for the client-side failure injection (with "(or the spec named in-PR)"). The injection lives in **`tests/e2e/error-sink.spec.ts`** instead: what is under test is the sink's absence, not the runner's timing, and the runner's specs are the load-sensitive family the checkpoint rows already track. `session-runner.spec.ts` itself is untouched and green in the battery. The spec census in `tests/unit/contracts/sync-response-fixture.test.ts` moved 14 → 15 for the new file.

## Automated Verification
```bash
npm test                       # unit specs against the injected transport
npm run test:api               # a route that throws is observed reporting, with headers/envelope intact
npx playwright test session-runner.spec.ts   # client-side failure injection still completes the flow (or the spec named in-PR)
```

## Definition of done
The RFC's "Sentry" line is closed with a red-observed reporting control on both sides and a documented no-op path; `docs/STATE.md` §1's "what does not exist yet" loses the telemetry entry.

## Dependencies
- Blocked by: M4-05 (shared context/id seam).
