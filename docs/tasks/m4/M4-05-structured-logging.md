> **M4-05** · Telemetry · `#priority/p1` · Derived from: master RFC M4 line ("**Structured logging with correlation ids**, Sentry, rate limits, …"); handoff §3.2 ("Structured logging with correlation ids, Sentry, and the 50 rps load test … explicitly not in M3").

## Intent
As the operator debugging a failed sync from a load run (or a user report), I want every request to carry a **correlation id from route handler to domain rejection** in structured logs — because today the only way to reconstruct a refused mutation is timestamps and luck, which is how M3-10 had to root-cause the backoff defect.

## Scope
- One logging seam (module) used by all route handlers, the sync engine's apply/reject path, and auth events; JSON-shaped output with a request-scoped id propagated through calls (no `console.*` sprawl — and the lint gate should make direct `console` in `src/app/api` a build break, following the repo's pattern of banning footguns by test, not promise).
- Rejection log lines carry `mutationId` + reason code + (once #77 lands) the message — never user payload content.
- Correlation id surfaces in the client-visible error envelope *only* as an opaque id (debuggable in support, no internal leakage).

## Out of scope
Sentry transport (M4-06); metrics channel (M4-07); log shipping/retention infra (deployment concern).

## Acceptance criteria
```gherkin
Scenario: One request, one id, whole trail
  Given a POST /api/sync that partially rejects
  When the server logs the request
  Then one correlation id links the route entry, the transaction outcome, and each rejection line
  And a unit test asserts the shape (id present, stable within a request, distinct across requests)

Scenario: Secrets stay out
  Given a request with tokens or weight data in the body
  When logged
  Then no header values, JWTs, email addresses, or row payloads appear — proven by a log-redaction test that is watched to fail against an unredacted injection

Scenario: The ban is enforced, not aspirational
  Given a new route handler written with console.log
  When CI runs
  Then lint fails — the no-logger-outside-the-seam rule is a gate with a captured red state
```

## Automated Verification
```bash
npm run lint && npm test
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/<logging seam specs>
npm run test:api    # route specs assert the structured line shape via an injected sink
```

## Definition of done
The seam exists with a red-observed lint ban, correlation ids are assertable in every log line a sync request emits, and M4-01's load artifact references the ids so a MISS row is traceable to a transaction.

## Dependencies
- Should precede M4-06 (Sentry keys off the same context) and ideally land before/alongside M4-01's first deep dive.
