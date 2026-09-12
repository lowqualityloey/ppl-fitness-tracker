> **M4-19** · M3 named non-goal · `#priority/p2` · Derived from: handoff §3.4 bullet 3 ("**Volume/streak analytics** (M3-08 out-of-scope). The legacy dashboard derives these from `new Date().getDay()` against a hardcoded schedule — **not from anything the user did. M4 must not port that fiction; compute from sessions or show nothing**"); `docs/STATE.md` §8 (2026-09-08 row: metrics "fabricated from `getDay()` and `Math.random()`").

## Intent
As a user of the dashboard, I want any volume or streak number to be *about my training* — the legacy cards showed weekly plans dressed as history, and M4 either computes the real thing from `workout_sessions`/`session_sets` or the space stays empty.

## Scope
- Define the smallest honest slice: e.g. weekly volume per day (sets × weight, kg-canonical then display-converted per ADR-0005) and a session-count streak (consecutive training days / weeks, derived from `local_date` of completed sessions).
- Server-side aggregation (the dashboard precedent: M3-04's SQL-aggregated day cards, "no counting done in the browser"); reads through repositories taking `userId` first (STATE §4 item 5, item 20).
- Null-weeks, the pull-day unrecoverable-set-data caveat (STATE §5), and imported sessions (source `legacy_import`, some weight NULL) each have a stated rendering rule — imported-without-load shows as *coverage*, which `lib/views/history-view.ts`'s `loadCoverage` already answers.

## Out of scope
Charts beyond the chosen slice; PR/e1RM restatement (progress screens own those); anything porting a hardcoded schedule into a "streak".

## Acceptance criteria
```gherkin
Scenario: A number is traceable to rows
  Given a seeded fixture user with known sessions/sets
  When the dashboard aggregate is computed
  Then the rendered volume/streak equals the repository-computed value asserted against the seeded rows row-by-row (not against itself)

Scenario: Fabrication is structurally banned
  When a reviewer greps the new code for schedule-derived or randomized metrics
  Then the only inputs are user session data; a unit negative control feeds zero sessions and asserts the honest empty state renders (not a plausible zero-shaped lie)

Scenario: kg stays canonical under lb users (ADR-0005)
  Given a user with preferredUnit lbs
  Then computation happens in kg and only the display boundary converts — asserted like M3-04's non-reversible weight test
```

## Automated Verification
```bash
npm test && npm run test:api
npx playwright test dashboard.spec.ts    # whatever spec file hosts the new assertions (existing registry naming)
```

## Definition of done
Handoff §3.4's third bullet retires with a shipped slice whose numbers survive a row-level audit, or a written owner decision that the space stays empty.

## Dependencies
- Soft: after M4-14 (one world, no legacy dashboard to "port" from). No schema work needed if aggregates come from existing tables — if a materialization is proposed, that lands behind M4-00.
