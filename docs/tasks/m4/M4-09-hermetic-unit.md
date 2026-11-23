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

---

## Outcome (2026-11-24) — DONE

Branch `fix/m4-09-hermetic-unit` off `origin/main` `ffb9bac`.

**Scope correction, measured not assumed.** The card's line above says the move needs a
`vitest.config.ts` include/exclude adjustment. It does not: `vitest.config.ts` includes
`tests/**/*.test.ts` and `package.json`'s `test` script excludes only `tests/integration/api/**`,
so the file is in `npm test` scope before and after the move on its path alone. `vitest.config.ts`
was not edited. The move changed exactly one specifier — `'../integration/test-helpers.js'` →
`'./test-helpers.js'` — because the file lands at the same directory depth; all 6 `it()` cases and
the `M1-11` describe are intact.

**AC-1, offline unit layer (green, and red first).** Baseline before the move:
`env -u DATABASE_URL -u MIGRATION_DATABASE_URL node node_modules/vitest/vitest.mjs run tests/unit`
= 1 failed file / 52 passed (53), the failure being the D2 file on a missing `DATABASE_URL`.
After: **53 files / 545 passed** with `DATABASE_URL`, `MIGRATION_DATABASE_URL`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
stripped. The repo's own `--env-file-if-exists=.env.local` cannot defeat this check because shell
environment wins over the env file (verified: `FOO=fromshell node --env-file-if-exists=<file with
FOO=filed>` prints `fromshell`), and no `.env.local` exists in this worktree anyway.

**AC-2, coverage did not shrink.** `npm test` with the local stack up:
baseline `ffb9bac` = **68 files / 680 passed**; after = **69 files / 683 passed**. The delta is the
new guard file and its 3 tests; nothing was dropped, rewritten or double-run. The moved file was
verified inside default scope directly: `vitest run tests/integration/with-user.test.ts
tests/integration/auth-confirm.test.ts` = 2 files / 8 passed.

**AC-3, the class is closed.** `tests/unit/infra/hermetic-unit-layer.test.ts` scans every
`tests/unit/**/*.test.ts` listed by `git ls-files --cached --others --exclude-standard` (filtered to
files that exist, so a staged rename's deleted path cannot ENOENT it) and fails on a socket client
import: `pg`, `drizzle-orm/node-postgres`, `net`, `tls`, `dgram`, `http`, `https`, `http2`,
`undici`, `ws`, `pg-pool`, `pg-promise`, `postgres`, `mysql`, `mysql2`, `sqlite3`,
`better-sqlite3`, `ioredis`, `redis`, `mongodb`, `@supabase/supabase-js`. It follows relative
specifiers up to 4 hops, but only when the target resolves inside `tests/`: a fixture may not reach
infrastructure, while `lib/` and `db/` legitimately import `pg` without connecting — that exclusion
is what keeps `tests/unit/db/client.test.ts` (verified hermetic: 4 passed with `DATABASE_URL`
unset) legal. It strips comments before scanning (its own doc block quotes the imports it forbids),
resolves the repo's NodeNext `.js` → `.ts` specifier form, and self-checks non-vacuity: it must scan
more than 20 files, it must find itself, and `tests/unit/with-user.test.ts` must be absent.

Injected probe, watched red, reverted:
1. The moved file copied back to `tests/unit/with-user.test.ts` with its old import →
   `imports 'pg' (opens a socket)` **and** `imports 'drizzle-orm/node-postgres' (opens a socket)`,
   `Test Files 1 failed`.
2. A synthetic `tests/unit/probe-chain.test.ts` importing `tests/integration/api/fixtures.js` (whose
   line 2 is `import { Client } from 'pg'`) → reported with the `[via ...]` chain, proving the
   one-hop rule is not decorative.
Both probes deleted; `git status` clean of them; guard back to 3 passed.

**Docs.** `docs/STATE.md` §5 strikes D2 and records it under closed debt with the measurements
above; `PROMPTKIT.md` §3 replaces the "fails offline by construction" caveat with the hermetic
statement plus the counts (88 `.test.ts` files: 53 unit, 30 integration of which 14 are API, 5
archived M0 spike tests; 16 e2e specs) and keeps the old failure mode as one line of history;
`docs/tasks/2026-09-11-intake-debt-index.md` marks D2 CLOSED in the status table and in its card;
`docs/SECURITY-CHECKLIST.md` no longer points the GUC regression suite at the unit layer;
`docs/tasks/m1/m1-11-with-user-hardened-helper.md`'s verification command paths the file correctly.
`docs/STATE-ARCHIVE.md` is left alone deliberately — it is the as-found archive, so its
`tests/unit/with-user.test.ts` references are correct for the dates they describe.
