> **M4-18** · M3 deliberate deferral — revisit trigger · `#priority/p3` · Derived from: handoff §3.4 bullet 2 ("**Timer persistence across reload.** Deliberate (M3-07 card: 'a rest timer is not worth outbox traffic') — a reload loses the running countdown. **Revisit if evidence says it costs users**"). **Inferred framing (labelled):** *how* the revisit happens — using M4-05/06 telemetry as the evidence source — is my proposal, not handoff text; the handoff names the trigger condition but no mechanism.

## Intent
As an athlete who reloads mid-rest (gym Wi-Fi), I want the decision about losing the countdown to be evidence-based now that M4 finally has telemetry — either the deferral is confirmed with data, or a cheap non-outbox persistence path (re-derive from `endsAt`, which is already absolute) replaces folklore with a fix.

## Scope
- With M4-05/06 live: instrument how often a reload/session-restart lands inside a running rest countdown (client event, not queue traffic).
- Decision: (a) confirmed non-cost → record it and close; or (b) fix — note the M3-07 rationale ("not worth outbox traffic") remains fully valid under (b): `endsAt` is an absolute anchor (STATE §4 item 10), so persisting it in IndexedDB/local *session* storage is not outbox traffic and does not violate §4.3's ban (that bans the queue being localStorage, not timers being durable).
- The card's deliverable is a decision + (if (b)) its implementation with the reload-resumes-countdown spec.

## Out of scope
The stretch-timer wiring (M4-17); any sync-contract change (this stays client-side by design).

## Acceptance criteria
```gherkin
Scenario: The trigger is consulted, not assumed
  Given a window of telemetry post-M4-06 (or an explicit owner waiver that no data exists yet)
  When the card closes
  Then docs/STATE.md §5/§7 carries the measurement (or the waiver) and the decision sentence

Scenario: If fixed, reload is survival, not resumption-by-hope
  Given a running rest timer
  When the page reloads (API reachable, per M3's offline model)
  Then the countdown resumes at the correct remaining time derived from the stored endsAt
  And a test proves a persisted *expired* anchor completes once, not never (the TimerController's fire-once rule extended across reload)
```

## Automated Verification
```bash
npm test    # timer-controller layer incl. any persistence adapter specs
npx playwright test timers.spec.ts
```

## Definition of done
§3.4's "revisit if evidence says it costs users" has an answer on the record either way; the phrase "deliberate" is backed by evidence rather than inertia.

## Dependencies
- Blocked by: M4-05 + M4-06 (evidence source), or closed early on an owner waiver (recorded as such).
