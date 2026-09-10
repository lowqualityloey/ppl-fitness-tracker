# Intake Debt Index — `pk:onboard` Re-scan (2026-09-11)

- **Source**: brownfield re-ingest of the repository against its recorded profile
- **Baseline commit**: `0546f7b` (= `origin/main`), branch `feat/m2-05-legacy-importer`
- **Method**: every claim below was produced by running the command, not by reading docs
- **Scope rule**: these are remediation items, **not** M2-05 importer work. They are
  small, independent, and safe to interleave.

Every finding is empirical. Nothing here is inferred from a comment or a README.

---

## D1 — Repository-wide lint is RED, and CI never runs it

**Severity**: High (declared invariant unenforced) · **Priority**: `#priority/p1` · **Est**: 1–2h

- `npm run lint` → **exit 1**, `26 problems (24 errors, 2 warnings)`
- All 26 are confined to four integration test files:
  - `tests/integration/app-role.test.ts`
  - `tests/integration/handle-new-user-trigger.test.ts`
  - `tests/integration/rls-content-tables.test.ts`
  - `tests/integration/schema-constraints.test.ts`
- Dominant rule: `@typescript-eslint/no-explicit-any`; plus 2 `no-unused-vars`
  warnings (`systemExercise`, `userAOverride` in `rls-content-tables.test.ts:386,392`)
- `.github/workflows/test.yml` runs: `typecheck` → `check-set-config.sh` → `npm test`.
  **There is no lint step.** The gate does not exist in CI, so the red state is invisible.

This is the exact failure mode `PROMPTKIT.md` §6 records as earned from this repo's own
history: *"A security control does not exist until a test proves it runs."* A rule that
is declared but never executed is a documented layer with zero enforcement.

**Acceptance criteria**

```gherkin
Scenario: Lint passes repository-wide
  Given a clean checkout with node_modules installed
  When I run `npm run lint`
  Then it exits 0 with no errors and no warnings

Scenario: CI fails if lint regresses
  Given a commit that introduces a new `any` into any tracked TS file
  When the Test Suite workflow runs on a PR containing it
  Then a lint job fails and blocks the merge

Scenario: The gate is proven to be able to fail
  Given the lint step is added to CI
  When a deliberately non-conforming file is pushed
  Then the job is observed red on that commit and green after it is reverted
```

**Fix shape**: add a `Lint` step (or job) to `test.yml`; type the four test files' row
shapes via the Drizzle `$inferSelect` types or narrow local interfaces rather than `any`;
drop the two unused bindings. Do **not** add an ignore entry — these are tracked files.

---

## D2 — The "unit" layer is not hermetic: `tests/unit/with-user.test.ts` opens a socket

**Severity**: Medium (false signal for the fastest feedback loop) · **Priority**: `#priority/p2` · **Est**: 30m

- `npx vitest run tests/unit` → **6 failed | 67 passed**, all 6 failures from one file:
  `tests/unit/with-user.test.ts`, error `connect ECONNREFUSED 127.0.0.1:54322`
- It calls `withUser()` against a real Postgres on purpose (it asserts GUC behaviour
  inside a transaction), so it is an integration test by dependency
- Consequence: `npm test` cannot pass on a machine with the Supabase stack down — which
  is the default offline state. The failure looks like a code regression and is not one.

**Acceptance criteria**

```gherkin
Scenario: Offline unit layer is green
  Given the Supabase local stack is stopped
  When I run `npx vitest run tests/unit`
  Then it exits 0

Scenario: GUC regression still runs where it belongs
  Given the stack is started
  When I run `npm test`
  Then the 6 withUser assertions still execute and pass as integration tests
```

**Fix shape**: move the file to `tests/integration/with-user.test.ts` (its dependency
matches its siblings there) rather than mocking the connection — mocking would gut the
test, since its whole value is that it talks to real Postgres GUCs.

---

## D3 — Playwright is configured against a directory that does not exist

**Severity**: Low (declared capability that does not exist) · **Priority**: `#priority/p3` · **Est**: 15m or 2h

- `playwright.config.ts` → `testDir: "./tests/e2e"`; `tests/e2e/` is absent; 0 spec files
  exist anywhere
- `PROMPTKIT.md` §2 lists "Playwright (E2E, including an offline-session flow)" under
  *Testing* with no status qualifier. As of today that is a plan, not a capability.

**Acceptance criteria**

```gherkin
Scenario: Docs do not overstate test coverage
  Given the current tree has no E2E specs
  When a reader consults PROMPTKIT.md §2 or docs/STATE.md §3
  Then E2E is explicitly marked as not yet existing, with the milestone that adds it
```

**Fix shape**: doc-only now (applied in this intake). The real spec lands with M3/M4's
offline-session flow; create `tests/e2e/` in that PR, not before.

---

## D4 — Drizzle's migration journal now covers 4 of 7 SQL migrations

**Severity**: Medium (silent schema-drift risk for anything generated later) · **Priority**: `#priority/p2` · **Est**: 1–2h

- `supabase/migrations/meta/_journal.json` entries: `0000`, `0001`, `0002`, `0003`
- `supabase/migrations/*.sql`: `0000`…`0006` → **`0004`, `0005` and now `0006` are
  hand-authored and absent from the journal**
- This already tracked as a debt item at 2 files; `0006_m2_04_sync_conflict_model.sql`
  widened it. `drizzle-kit generate` writes into this same directory
  (`drizzle.config.ts: out: './supabase/migrations'`), so the next generated migration
  is produced from a snapshot that does not include the three newest ones and can emit
  DDL that contradicts deployed reality.

**Acceptance criteria**

```gherkin
Scenario: Generated migrations start from deployed reality
  Given the database is at migration 0006
  When I run `drizzle-kit generate` after reconciling the journal/snapshots
  Then it produces no dropping or re-adding DDL for objects 0004–0006 already created

Scenario: Drift cannot re-appear silently
  Given the journal and the SQL directory are reconciled
  When CI runs the suite
  Then a check fails if a new .sql file exists with no journal entry (or vice versa)
```

**Fix shape**: pick one authorship model for this directory and record it in
`PROMPTKIT.md` §3 — either (a) all migrations hand-authored and `drizzle-kit generate`
is disabled/pointed elsewhere, or (b) journal-managed and hand-authored files are folded
back in. Option (a) is closer to how the repo has actually been operating since `0004`.

---

## D5 — The route-handler suites are excluded from the only CI job that exists

**Severity**: High (the thickest behavioural coverage is outside the merge gate) · **Priority**: `#priority/p1` · **Est**: 30m–1h

- `package.json` → `"test": "vitest run --exclude 'tests/integration/api/**'"`
- `.github/workflows/test.yml` steps: `typecheck` → `check-set-config.sh` → `npm test`
  → `supabase stop`. **`npm run test:red` is never invoked in CI**, and `test.yml` is the
  only workflow in the repo.
- What that excludes: 6 files covering 9 endpoints — `auth`, `exercises`, `progress`,
  `sessions`, `sync`, `import-legacy` — i.e. every assertion in the repo that goes
  through real HTTP, real SSR cookies, and the AppError envelope. M2-01 → M2-04 shipped
  their route-level guarantees into a suite the gate does not read.
- The exclusion was correct when it was made (`M1-16` filed them as an intentional RED
  baseline for handlers that did not exist). Handlers now exist for everything except
  the M2-05 importer, so the original justification has expired.

```gherkin
Scenario: Route regressions block the merge
  Given a PR that breaks an authenticated sessions or sync route
  When the Test Suite workflow runs
  Then the job fails on the API suite rather than passing on `npm test` alone

Scenario: Genuinely pending work is marked, not hidden
  Given `import-legacy.test.ts` is still red before M2-05 lands
  When CI runs the API suites
  Then that file is individually skipped with a linked issue reference, not excluded by directory glob
```

**Fix shape**: add a CI step running the API suites with the same env block; keep
`import-legacy` out by `test.skip` naming `M2-05`, so the count of skipped specs is
visible in the report instead of invisible in a glob.

**Sequencing note**: D5 depends on D2 being fixed or the API job will look identical to a
real regression when the stack is flaky — CI already starts Supabase, so it is safe there;
it is the *local* reflex "run `npm test`, see red, assume my code" that D2 protects.

---

## Non-findings (checked, clean)

Recorded so the next intake does not re-run them:

- `git grep -nE "TODO:|FIXME:|HACK:|XXX:"` across `src/ lib/ db/ tests/ scripts/` → **0 hits**
- `git grep -c ": any"` across `src/ lib/` → **0 hits** (production code is `any`-free)
- Empty `catch {}` blocks in `src/ lib/` → **0 hits**
- `npm run typecheck` (`next typegen && tsc --noEmit`) → **exit 0**, clean
- `tsconfig.json`: `strict: true` **plus** `noUncheckedIndexedAccess: true`
- Working tree clean; `.env.local` present and gitignored; `dist/`, `.next/`,
  `*.tsbuildinfo` correctly ignored
- Legacy `npm run build` → still exits 0 and emits **0 `.js` files**; the documented
  defect is intact and still correctly labelled in `PROMPTKIT.md` §2
- Docker daemon reachable (`29.7.2`); Supabase stack currently **stopped**
