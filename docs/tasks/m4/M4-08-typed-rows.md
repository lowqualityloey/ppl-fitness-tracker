> **M4-08** · Test infrastructure (D7) · `#priority/p1` · Derived from: `docs/STATE.md` §5 D7 ("**D7 · The integration suites read query results through inferred `any`** … `Client.query()`'s default generic means `rows[0].slug` … are still untyped … A typo'd column reads `undefined`, and `expect(undefined).toBe(undefined)` passes — **in the files that *are* the security gate**"), §7 item 5 ("D7 … is an M4 item now, because the 50 rps load test and the hardening pass will pile more assertions onto the same untyped foundation").

## Intent
As the person who will believe M4's tenancy assertions, I want the integration/security suites' row reads typed — so a renamed column fails at compile time instead of asserting `undefined === undefined` green inside the files that guard RLS.

## Scope
- Give `Client.query()` (the suite harness client) a required generic and/or row-shape types at each read site in `tests/integration/**` — narrowing, not casting: D1's lesson applies (the fix must *reject* a wrong shape, `tests/integration/pg-error.ts` is the precedent).
- `noUncheckedIndexedAccess` is already on — the types must make a missing row a compile error, not a runtime `undefined` read.
- Mechanical but wide: keep it one reviewable PR; no assertion semantics change in this card (if typing reveals a vacuous assertion, fix it and say so in the PR body, per this repo's honesty convention).

## Out of scope
Unit-layer hermeticity (D2/M4-09); new security assertions (they come *after* this foundation).

## Acceptance criteria
```gherkin
Scenario: A typo'd column cannot pass
  Given the typed harness
  When a spec reads a column that the SELECT does not return (injected scratch edit)
  Then typecheck fails at the read site — demonstrated and captured, then reverted

Scenario: A missing row cannot pass
  Given rows[0] is possibly-undefined by type
  When a spec dereferences it without a guard
  Then `npm run typecheck` exits non-zero
  And the guard, when present, asserts presence rather than comparing undefined

Scenario: Nothing weakened
  When the card lands
  Then lint/typecheck/test/test:api/mutation are all green with the same or higher test counts, and no assertion was deleted to silence a type
```

## Automated Verification
```bash
npm run typecheck && npm run lint && npm test && npm run test:api && npm run test:mutation
```

## Definition of done
`grep`ing the integration suites for `.query(` yields call sites whose rows carry declared shapes; D7 is struck from `docs/STATE.md` §5 with this card's reference.

## Dependencies
- Should precede M4-01/M4-02 *server-side* assertions if those grow integration-style checks; independent otherwise.
