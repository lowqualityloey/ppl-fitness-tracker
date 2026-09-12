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
