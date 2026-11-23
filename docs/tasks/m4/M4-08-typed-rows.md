> **M4-08** · Test infrastructure (D7) · `#priority/p1` · Derived from: `docs/STATE.md` §5 D7 ("**D7 · The integration suites read query results through inferred `any`** … `Client.query()`'s default generic means `rows[0].slug` … are still untyped … A typo'd column reads `undefined`, and `expect(undefined).toBe(undefined)` passes — **in the files that *are* the security gate**"), §7 item 5 ("D7 … is an M4 item now, because the 50 rps load test and the hardening pass will pile more assertions onto the same untyped foundation").

## Intent
As the person who will believe M4's tenancy assertions, I want the integration/security suites' row reads typed — so a misspelled row field fails at compile time, and schema-derived shapes fail when a schema column is renamed, instead of asserting `undefined === undefined` green inside the files that guard RLS. A wrong SQL alias in a hand-written query remains a runtime risk: the generic is a caller assertion, not SQL validation.

## Scope
- Give `Client.query()` (the suite harness client) a required generic and/or row-shape types at each read site in `tests/integration/**` — narrowing, not casting: D1's lesson applies (the fix must *reject* a wrong shape, `tests/integration/pg-error.ts` is the precedent).
- `noUncheckedIndexedAccess` is already on — the types must make a missing row a compile error, not a runtime `undefined` read.
- Mechanical but wide: keep it one reviewable PR; no assertion semantics change in this card (if typing reveals a vacuous assertion, fix it and say so in the PR body, per this repo's honesty convention).

## Out of scope
Unit-layer hermeticity (D2/M4-09); new security assertions (they come *after* this foundation).

## Acceptance criteria
```gherkin
Scenario: A misspelled row field cannot pass
  Given the typed harness
  When a spec reads a field absent from its declared row type (injected scratch edit)
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

**Scope correction (2026-11-23):** `Client.query<T>` is a caller assertion; TypeScript does not parse SQL. The compile-time guarantee covers a field absent from the declared row type and schema-derived shapes when the schema changes. A wrong SQL alias in a hand-written SELECT remains a runtime risk. The AC-1 control below is a property typo, not a SELECT-alias mutation.

## Implementation record (2026-11-23 — measured on this host)

**Delivered:** ten commits, `99b1cba..e889f24`, type every row-reading `Client.query()` in
`tests/integration/**` and narrow every single-row read through `requireRow`. Row shapes are
derived from `db/schema/index.ts` where the selected alias matches and declared locally for
catalog, aggregate and trigger probes. SQL, thresholds, counts and assertion semantics are
unchanged: the branch adds or removes zero `it(` / `test(` cases, and every transformed
assertion keeps its original predicate and expected value.

**Negative controls (fresh, 2026-11-23)** — both injected into
`tests/integration/app-role.test.ts`, captured, then restored byte-for-byte:

| Criterion | Injection | Observed |
| :--- | :--- | :--- |
| **AC-1** misspelled row field | `void role.rolcanlogi;` after the typed `requireRow` | `npm run typecheck` exit **2**: `app-role.test.ts(63,11): error TS2551: Property 'rolcanlogi' does not exist on type 'AppRoleRow'. Did you mean 'rolcanlogin'?` |
| **AC-2** missing row | `void result.rows[0].rolcanlogin;` at the same read | `npm run typecheck` exit **2**: `app-role.test.ts(63,6): error TS2532: Object is possibly 'undefined'.` |

`cmp` confirms both restores were byte-identical, `git diff` was clean, and post-restore
`npm run typecheck` exited 0.

**Full gate at `e889f24`**:

| Command | Result |
| :--- | :--- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 67 passed (67) files; 673 passed, 3 skipped (676) |
| `npm run test:api` | 14 passed (14) files; 84 passed (84), Linux `node:24-bookworm-slim` runner |
| `npm run test:mutation` | all 6 mutations caught; restore 6/6 passed |

**Definition of done:** every row-reading `.query(` call carries a declared result shape;
`rows[0]` survives only inside `requireRow`, and the one `rows[1]` read in `tenancy.test.ts` is
guarded by an exact two-row assertion and `requireRowAt`. D7 is retired in `docs/STATE.md` §5 with
this card and #97.

**Post-audit hardening (2026-11-23):** app-role test connections now require `DATABASE_URL`
with no inline fallback; the BYPASSRLS test replaced the vacuous `expect(true).toBe(true)` with
real true/false assertions and restores in `finally`; the tenancy seed asserts exactly two
routine-day rows and reads the second through `requireRowAt`. Focused checks: `npm run typecheck`,
`npm run lint`, and 3 files / 53 tests passed. No production code changed.

**Full gate at `23b180b`** (code HEAD; this note was uncommitted during the run):

| Command | Result |
| :--- | :--- |
| `npm test` | 67 passed (67) files; 673 passed, 3 skipped (676); 55.68s; exit 0 |
| `npm run test:api` | 14 passed (14) files; 84 passed (84), Linux `node:24-bookworm-slim`; 93.35s; exit 0 |
| `npm run test:mutation` | 6/6 mutations caught; 6/6 restores passed; final 6/6 passed; exit 0 |

**Status:** the D7 closeout is on local branch `test/m4-08-typed-rows` at `a716d8b`; post-audit
hardening is on top. #97 remains open until this lands as a PR and its acceptance is reviewed.
Nothing was pushed.

## Automated Verification
```bash
npm run typecheck && npm run lint && npm test && npm run test:api && npm run test:mutation
```

## Definition of done
`grep`ing the integration suites for `.query(` yields call sites whose rows carry declared shapes; D7 is struck from `docs/STATE.md` §5 with this card's reference.

## Dependencies
- Should precede M4-01/M4-02 *server-side* assertions if those grow integration-style checks; independent otherwise.
