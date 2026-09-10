# Intake Debt Index — `pk:onboard` Re-scan (2026-09-11)

- **Source**: brownfield re-ingest of the repository against its recorded profile
- **Baseline commit**: `0546f7b` (= `origin/main`), branch `feat/m2-05-legacy-importer`
- **Method**: every claim below was produced by running the command, not by reading docs
- **Scope rule**: these are remediation items, **not** M2-05 importer work. They are
  small, independent, and safe to interleave.

Every finding is empirical. Nothing here is inferred from a comment or a README.

**Status after follow-through (same day).** D1 and D5 are implemented on local branches
with evidence, not pushed. Working the gate surfaced three more items — an unfilled
credential that had been faking a code regression, and two structural findings (D6, D7):

| Item | State | Where |
| :--- | :--- | :--- |
| D1 lint red, unenforced | **CLOSED** — merged in PR #48 | 22 casts → typed helpers, 2 unused bindings dropped, `--max-warnings=0`, CI `Lint` step; `main` lint exit 0 |
| D2 non-hermetic unit layer | open | unchanged; see the correction under D2 — it passes with a working environment, so the defect is classification, not correctness |
| D3 phantom E2E config | **doc-closed** | `PROMPTKIT.md` §2/§3 now state E2E does not exist; `tests/e2e/` to be created with its first spec in M3/M4 |
| D4 migration journal gap | open | blocks the next `db:generate`; M2-05 should avoid needing one |
| D5 route suites outside CI | **CLOSED** — merged in PR #48 | API step + preflight + declared-pending registry + anti-rot guard + env guard; `main` CI runs the gate green |
| D6 test run rewrites tracked `tsconfig.json` | open (new) | below |
| D7 integration suites read `pg` results as inferred `any` | open (new) | below |

Branch and PR names, deliberately **no commit SHAs**: this table was first written with hashes,
and two events invalidated them inside an hour — a branch was rebased to drop an
accidentally-included commit, then both gate branches were re-ordered onto one branch to resolve a
`package.json` conflict before the PR was opened. Same reasoning `docs/STATE.md` §1 already records
for not pinning `main`. Current tip: `git log --oneline origin/main..test/ci-gates-d1-d5`.


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

**Closed 2026-09-11 (merged, PR #48)** — all 24 cleared by narrowing through
`tests/integration/pg-error.ts` (`unknown` → SQLSTATE/message; `undefined`/`''` for
non-database throws) rather than by typing a fake error, which would have let a spec expecting
`42501` pass against an unrelated error. 2 unused bindings dropped, `lint` is now
`eslint --max-warnings=0 .`, CI runs it after `npm ci`. Proven able to fail: a scratch
`const probe: any = 1` exits 1 naming the rule. Leftover strictness is now D7, not D1.

---

## D2 — The "unit" layer is not hermetic: `tests/unit/with-user.test.ts` opens a socket

**Severity**: Medium (false signal for the fastest feedback loop) · **Priority**: `#priority/p2` · **Est**: 30m

- `npx vitest run tests/unit` → **6 failed | 67 passed**, all 6 failures from one file:
  `tests/unit/with-user.test.ts`, error `connect ECONNREFUSED 127.0.0.1:54322`
- It calls `withUser()` against a real Postgres on purpose (it asserts GUC behaviour
  inside a transaction), so it is an integration test by dependency
- Consequence: `npm test` cannot pass on a machine with the Supabase stack down — which
  is the default offline state. The failure looks like a code regression and is not one.

**Confirmed by re-run 2026-09-11**: with the stack up and a *working* `DATABASE_URL`, all
6 pass and the whole non-API suite is green (**23 files / 196 tests**). So the defect is
classification and dependency honesty, not correctness — and note this file's own D5
sequencing warning below ("fix D2 first or the API job looks like a regression") was aimed
at the wrong cause: the local redness was a credential, not a flaky stack.

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

**Fix shape (as implemented)**: env moved to job level; new `Preflight integration
environment` and `Run API route-handler suites` steps; `npm run test:api` added;
`test:red` kept as an alias. The 11 specs whose handlers are still unbuilt are declared in
`tests/integration/api/pending-handlers.ts` (route → issue → reason) and run as *counted*
skips, guarded against rot by `tests/unit/api/pending-handlers.test.ts`, which fails if an
entry's route surface appears on disk. `fixtures.ts` additionally throws at module scope
when its credentials are missing, because a throw inside `beforeAll` was being reported as
20 skipped tests.

**Correction to the sequencing note written earlier in this file**: it claimed D5 should
follow D2 "or the API job will look identical to a real regression when the stack is
flaky". The actual hazard turned out to be neither flakiness nor D2 — it was a *credential*
(see "Closed during follow-through" below), which made 10 route assertions fail as HTTP 500
while looking exactly like product bugs. The mitigation added for that is
`npm run test:api:preflight`, not a reordering of D2 and D5.

**Closed 2026-09-11 (merged, PR #48)** — CI runs `npm run test:api` behind
`npm run test:api:preflight`, env hoisted to job level, and the 11 specs whose handlers do not
exist are declared in `tests/integration/api/pending-handlers.ts` as counted, issue-attributed
skips with the anti-rot guard. Measured in CI on the default branch: 20 passed / 12 skipped.

---

## D6 — Running the API suite rewrites the tracked `tsconfig.json`

**Severity**: Low (local tree hygiene; misleading diffs) · **Priority**: `#priority/p3` · **Est**: 15m

- Observed 2026-09-11: `npm run test:api` boots `next dev` (via
  `tests/integration/api/test-server.ts`), and Next.js **modifies the tracked
  `tsconfig.json`** as a side effect — reformatting its arrays and appending
  `".next/dev/dev/types/**/*.ts"` to `include`.
- Consequence: a test run silently dirties the working tree, so `git status` after a
  suite tells you nothing about what you changed, and a `git add -A` in a later commit
  sweeps in someone else's formatter.
- Not a CI problem (fresh checkout per job); purely a local-review hazard, and mildly
  annoying in stacked sessions like this one.

```gherkin
Scenario: A test run leaves the tree clean
  Given a clean working tree
  When I run `npm run test:api`
  Then `git status --porcelain` is empty afterwards
```

**Fix shape**: either commit the generated include entry once so Next stops rewriting it,
or restore the file after the run in `afterAll`/the CI step (`git checkout -- tsconfig.json`
is wrong-shaped for a library; prefer pinning the entry in the repo). Reverted manually in
this session; no decision recorded yet.

---

## D7 — Integration suites read query results through inferred `any`

**Severity**: Medium (the discipline `PROMPTKIT.md` §6 asks for stops at the test seam) · **Priority**: `#priority/p2` · **Est**: 2–3h

- D1 removed the 24 **explicit** `any`s, but the underlying looseness in these files is
  wider: node-postgres' `Client.query()` and Drizzle's raw paths default to
  `QueryResult<any>` / `any` rows, so `rows[0].slug`, `rows[0].rolcanlogin`, `rows[0].n`
  etc. typecheck **today** purely because the values are inferred `any`. With
  `noUncheckedIndexedAccess: true`, an out-of-range `rows[0]` is also not being caught at
  these sites — it is caught (or not) at runtime by the assertion.
- Found while fixing D1: naming a strict row type on `executeAsUser` in
  `tests/integration/rls-content-tables.test.ts` forced ~20 call sites into "a row must
  exist" guards, so that file's `Promise<any>` annotation was dropped rather than faked —
  the return type is now inferred, and the strictness question is recorded here instead of
  being papered over inside a lint commit.
- Highest-value targets are the files whose assertions *are* the security gate
  (`rls-user-data-tables`, `rls-content-tables`, `schema-constraints`, `app-role`,
  `tenancy`): a typo'd column name in a row shape today reads as `undefined`, and
  `expect(undefined).toBe(undefined)` is a passing assertion.

```gherkin
Scenario: Row shapes are checked at compile time
  Given the RLS and constraint suites
  When a test reads a column that does not exist on the table
  Then `npm run typecheck` fails rather than the test passing on `undefined`

Scenario: A missing row is impossible to ignore
  Given a query expected to return exactly one row
  When the code reads `rows[0]`
  Then TypeScript forces an explicit presence check
```

**Fix shape**: derive row types from the schema (`typeof table.$inferSelect` from
`db/schema/index.ts`) behind a small `queryRow<T>()` / `requireRow()` helper in
`tests/`, and adopt it file by file. Sequence it before M2-06's "security negative
controls", since typed rows are what make those controls hard to write wrong.

---

## Closed during follow-through (not debt cards — incidents)

### The app-role credential in this checkout was never filled in

- `.env.local` carried `DATABASE_URL="postgresql://app_authenticated.pooler-dev:REPLACE_IN_M1-04@..."`.
  The role **does** exist (M1-04/#6), and `supabase start` cannot tell you its password:
  `app_authenticated` is created by this repo's own migration `0001` with a **literal**
  password, so no CLI output ever supplied it. The header comment in `.env.example` said to
  take local values from `npm run db:status`, which is true for the anon/service keys and
  false for this one — so the placeholder looked like a still-pending task rather than a
  misconfiguration.
- Symptoms, in the order they misled: `/api/sessions` and `/api/sync` returned blanket
  **HTTP 500** (10 failing status assertions) → then `28P01 password authentication failed`
  on both 54329 and 54322 → then Supavisor escalated to
  `(ECIRCUITBREAKER) too many authentication failures, new connections are temporarily
  blocked`, which reads like an infra fault rather than a bad password.
- Cost: ~30 minutes to disprove a false "M2-04 regressed the routes" theory. With the
  credential corrected, **sessions 12/12 and sync 7/7 pass** — the suites were fine; the
  machine was not.
- Fixed as part of D5: `.env.local` corrected locally, `.env.example` template fixed
  (tenant-qualified username + explicit pointer to migration `0001`), and
  `npm run test:api:preflight` added so the next person gets a 2-second diagnosis instead.

### Two open risks this incident exposes, worth deciding on

1. **A committed app-role password literal, in three places.** Migration `0001`,
   `.github/workflows/test.yml`, and (until now) `.env.local` all carry the same
   `app_authenticated` credential. Harmless for a local-only dev role, and the role is
   `NOBYPASSRLS`/owns nothing — but the *same role name* is what ADR-0003 specifies the
   production app connects as, and there is no guard in `0001` marking it local-only. If a
   hosted project ever applies this migration as written, the credential is in the public
   repo. Decide: parameterise it, or state in the migration header that hosted deploys must
   not run `0001` verbatim.
2. **`db:up` binds 0.0.0.0 with shared default keys** (the CLI says so itself). Fine on a
   laptop; worth a line in `PROMPTKIT.md` §3 if this repo is ever worked on from a shared
   network. Also note `supabase start` in CI does **not** pass the `-x` service exclusions
   that `npm run db:up` uses, so CI and local run different service sets — no observed
   impact, but it is a divergence, not a parity guarantee.

---

## Non-findings (checked, clean)

Recorded so the next intake does not re-run them:

- `git grep -nE "TODO:|FIXME:|HACK:|XXX:"` across `src/ lib/ db/ tests/ scripts/` → **0 hits**
- `git grep -c ": any"` across `src/ lib/` → **0 hits** (production code is `any`-free)
- Empty `catch {}` blocks in `src/ lib/` → **0 hits**
- `npm run typecheck` (`next typegen && tsc --noEmit`) → **exit 0**, clean
- `tsconfig.json`: `strict: true` **plus** `noUncheckedIndexedAccess: true`
- Working tree clean; `.env.local` present and gitignored (though its `DATABASE_URL` was
  an unfilled placeholder — see incidents above); `dist/`, `.next/`, `*.tsbuildinfo`
  correctly ignored
- Legacy `npm run build` → still exits 0 and emits **0 `.js` files**; the documented
  defect is intact and still correctly labelled in `PROMPTKIT.md` §2
- Docker daemon reachable (`29.7.2`)

**Measured with the stack up and the credential corrected** (first time this checkout has
been able to run its own gates, so the next intake can cite these instead of re-deriving):

- `npm test` → **23 files / 196 tests, all pass**, exit 0 (includes the RLS, tenancy,
  app-role, schema-drift, seed and constraint suites)
- `npm run test:api` → **20 passed / 12 declared-skipped** (32), exit 0
- `npm run test:api:preflight` → 4/4 ok, exit 0; **fails loudly with exit 1** when
  `DATABASE_URL`/`MIGRATION_DATABASE_URL` are absent
- `npm run lint` → exit 0 with **0 errors, 0 warnings** under `--max-warnings=0`; proven to
  exit 1 on a reintroduced `any`
- `npm run typecheck` → exit 0 throughout
- Suite wall-clock: unit ~3s, non-API integration ~14s, API ~15s — the `fileParallelism:
  false` serialization costs little here, so it is not worth revisiting for speed
