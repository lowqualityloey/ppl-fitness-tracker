> **M4-09** · Test infrastructure (D2) · `#priority/p2` · Derived from: `docs/STATE.md` §5 D2 ("`tests/unit/with-user.test.ts` is an integration test in the unit layer (opens a socket to `:54322`), so the fastest feedback loop is red offline by construction"), §3 Verification Commands ("`npx vitest run tests/unit` fails **offline by construction**").

## Intent
As a developer without the stack up (or an agent in a stripped sandbox), I want `npx vitest run tests/unit` to be green by construction — the unit layer's speed is the point, and a known-red layer trains people to ignore red.

## Scope
- Move `tests/unit/with-user.test.ts` (6 GUC assertions against real Postgres) to `tests/integration/` where it belongs, adjusting `vitest.config.ts` include/exclude so `npm test`'s totals still cover it (it is currently covered — it runs under the *default* `npm test` scope; the move must not drop or double-run it).
- Update `PROMPTKIT.md` §3's counts and the D2 description of the failure mode (it is the only place the "unit layer is red offline" caveat lives — it should become history text).
- Guard against recurrence: a cheap structural test (file-scan or config assertion) that fails if a `tests/unit` file imports `pg`/opens sockets — the repo's own pattern (structural scans over promises).

## Out of scope
Any other misclassification hunt beyond what the socket-import scan finds; DB-test speed work.

## Acceptance criteria
```gherkin
Scenario: Unit layer is honest offline
  Given the stack is DOWN and the environment is stripped of DB URLs
  When npx vitest run tests/unit
  Then it is fully green — and observed red once, before the move, as the baseline capture

Scenario: Coverage did not shrink
  Given the stack is UP
  When npm test runs
  Then the moved file's 6 assertions execute under tests/integration and the totals match the pre-move count minus zero

Scenario: The class is closed
  When a future unit file reaches for a socket
  Then the structural guard fails it — observed by injecting a probe import and watching the gate bite, then reverting
```

## Automated Verification
```bash
env -u DATABASE_URL -u MIGRATION_DATABASE_URL npx vitest run tests/unit   # green offline
npm run db:up && npm test && npm run db:down                              # same totals, all green
```

## Definition of done
D2 struck from `docs/STATE.md` §5; `PROMPTKIT.md` §3's "fails offline by construction" caveat rewritten as retired.

## Dependencies
- None; do it before M4's count-heavy cards so their quoted totals aren't chasing a moving file.
