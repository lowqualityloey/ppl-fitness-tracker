# Task Record: Clear the branch review's queued follow-ups (F-1 to F-5)

<a id="TASK-branch-review-follow-ups"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-branch-review-follow-ups`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Documentation Work`
- **Work Type Note**: The register is mixed by construction. F-1 adds a workflow (configuration), F-2 corrects three documents (documentation), F-4 and the F-5 child leak change code under `tests/` and `scripts/`. The record is filed as Documentation Work because its first deliverable is the corrected record set; each code item must add its own measured evidence and its own TDD decision before it is executed, and F-5 already requires a separate record.
- **Planning Record Link**: [PLAN-promptkit-v2-4-upgrade](../specs/2026-11-22-spec-promptkit-v2-4-upgrade.md#PLAN-promptkit-v2-4-upgrade)
- **Planning Depth Reference**: `Minimal`
- **Assumption Record Links**: `None`
- **Specification**: `docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md`
- **External Reference**: `N/A - local Markdown tracking; no issue filed`
- **Owner / Actor**: `Agent (DeepSeek Harness / lead)`
- **Execution Scope**: `ppl-fitness-tracker, branch chore/promptkit-v2-sync, one worktree`
- **Approval Boundary**: `The owner's instruction at m03192 ("do next steps 1 and 3") authorizes opening this record and executing F-3. Every other item needs a fresh go-ahead before it runs, and F-1 and F-4 need it explicitly because they change CI and shared test infrastructure. Commit, push, PR, merge, tag, release, deploy, and any action outside this repository require explicit human confirmation.`
- **Created**: `2026-11-22 08:45 UTC`

> This Local Task Source is authoritative for Controlled Work. The Planning Record supplies context only; it does not control readiness, execution state, active ownership, completion, or approval.

## 2. Objective and Boundaries

- **Objective**: `Convert the five follow-ups this plan left open into tracked, individually verifiable work: F-1 the missing governance CI (sourced from spec section 9, not from the review - see the Provenance Note below), F-2 the three evidence defects in the API-suite documents, F-3 the docs/STATE.md reconciliation against origin/main, F-4 the fixtures.ts anon-key fallback and the missing preflight check, and F-5 the six pre-existing Drizzle/RLS failures plus the owned-child leak. Each item closes on measured evidence, not on an assertion that it was addressed.`
- **In Scope**:
  - `.github/workflows/governance.yml` - the governance workflow F-1 adds; `.github/workflows/test.yml` is read only, so its `paths-ignore` cost control is not silently undone
  - `docs/specs/2026-11-19-spec-api-suite-hardening.md` - F-2: the 31-to-36 test count, the AC-13 row, and G5's scope
  - `docs/tasks/2026-11-19-api-suite-hardening.md` - F-2: AC-11's evidence and the 31-to-36 count in the completion gate
  - `tests/integration/api/fixtures.ts` - F-4: remove the anon-key fallback and the `process.env` assignment
  - `scripts/preflight.ts` - F-4: the missing anon-key check
  - `tests/integration/api/test-server.ts` - F-5: stop the owned child on a failed spawn
  - `docs/tasks/` - the separate record F-5 requires for the six Drizzle/RLS failures
  - `docs/STATE.md` - section 1 Last Updated, the section 3A projection, and the section 8 session row
  - `docs/tasks/2026-11-22-branch-review-follow-ups.md` - this Task Record
  - `docs/reviews/2026-11-22-promptkit-v2-sync-branch.md` - the findings register this record consumes, read only
- **Provenance Note**: `F-1 does not come from the branch review. The review's own findings are F1 the AC-11 working-tree evidence, F2 the fixtures.ts anon key, F3 the owned-path child leak, F4 the stale STATE 3A, F5 the AC-13 counts; its "order of work, cheapest first" list is five items and none is a workflow, and it closes by stating that it authorizes nothing. F-1 is listed verbatim in docs/specs/2026-11-22-spec-promptkit-v2-4-upgrade.md section 9 ("Follow-ups this plan does not do"): "F-1 - PromptKit Governance CI. Still absent; test.yml ignores docs/** and **/*.md, so a governance-only commit runs no workflow at all." This record's earlier wording called all five "the findings the branch review left queued", which overstated the review's reach; corrected 2026-11-22 during F-1 so that no item is attributed to a source that does not contain it.`
- **Explicit Non-Goals**:
  - Application source, schema, auth, API, database, or runtime changes of any kind
  - Re-reviewing the branch or re-opening findings the review already closed
  - Fixing the six Drizzle/RLS failures inside this record (F-5 needs its own record with its own reproduction)
  - Changing `test.yml`'s `paths-ignore` cost control, or accepting a docs-only CI cost without the measurement that justified the ignore list
  - Pinning `origin/main` instead of tag `v2.4.0`, or greening the doctor's `STALE(+12)` row
  - Release, tag creation, publication, deployment, or any remote action
- **Dependencies**: `The review report on disk (it is currently untracked, so this record's citation resolves only while the file exists). F-4 needs a reachable Supabase local stack to prove the removal does not break the green lane; the host's Docker port publishing was broken on 2026-11-20 and was working again when the reviewer measured on 2026-11-22, so the stack state must be re-established rather than assumed.`
- **Risk**: `Medium overall, concentrated in two items. F-1 can reintroduce the docs-only CI cost that paths-ignore was added to remove, so it needs its own cost reasoning. F-4 changes how every one of the thirteen API test files resolves its anon key, and a mistake turns a named error into a collection-time crash. F-2 and F-5's record are documentation and carry no runtime risk.`
- **Verification Condition**: `bash .promptkit/scripts/validate-references.sh --strict exits 0; bash .promptkit/scripts/validate-execution-control.sh --root . exits 0 with VALID; bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit exits 0; bash .promptkit/scripts/check-doctor.sh . reports docs-drift OK; npm run typecheck and eslint --max-warnings=0 . exit 0; and, for the code items only, npm run test:api returns 14 files / 84 tests green against a reachable stack.`

## 3. Acceptance Criteria

- [x] **AC-1** (F-1): A governance workflow exists that runs the three governance validators on changes to the governance surface.
  - **Result**: `PASS`
  - **Evidence**: `.github/workflows/governance.yml` (name `Governance`) runs all three, at `:114` `bash .promptkit/scripts/validate-references.sh --strict`, `:119` `bash .promptkit/scripts/validate-execution-control.sh --root .`, `:125` `bash .promptkit/scripts/check-setup-assert.sh . .promptkit .promptkit`. It parses under `python3 -c 'yaml.safe_load(...)'` with top keys name/on/concurrency/permissions/jobs, job `governance` keys `runs-on`/`timeout-minutes`/`steps`, `timeout-minutes: 5`, and exactly those four steps. `actionlint -no-color` 1.7.7 exits 0 on it, and on `test.yml` too.
- [x] **AC-2** (F-1): The governance workflow's `paths` cover `docs/**`, `**/*.md`, `PROMPTKIT.md`, the five host directives, and `.promptkit`, so a governance-only commit runs at least one workflow.
  - **Result**: `PASS`
  - **Evidence**: both events carry the same ten paths: `docs/**`, `**/*.md`, `PROMPTKIT.md`, `AGENTS.md`, `CLAUDE.md`, `.clinerules/promptkit.md`, `.opencode/rules.md`, `.github/copilot-instructions.md`, `.promptkit`, `.promptkit/**`. Replaying every one of the 23 `origin/main..HEAD` commits through both path filters: `governance.yml` would run on 22 of 23, `test.yml` on 6 of 23. The four v2.4.0 commits resolve as follows - `17b64ed` already runs BOTH (it touches the `.promptkit` gitlink, which `paths-ignore` does not ignore), while `c54be47`, `b8d45c9` and `cee530a` are docs-only and run nothing today. So the criterion holds for three of the four, not all four; the earlier phrasing implied all four and is corrected here rather than left as a convenient overstatement. The single commit in the branch that governance does not cover is `81fdd3c`, the dependency upgrade, which is code-only.
- [x] **AC-3** (F-1): The workflow is cheap by construction - one job, no browser download, no service containers - and the record states what it adds to the measured CI cost that `paths-ignore` was created to reduce.
  - **Result**: `PASS`
  - **Evidence**: one job, one runner, four steps, `permissions: contents: read`. No `npm ci`, no Node setup, no service container, no Playwright, no artifact or cache step; the only action is `actions/checkout@v4`. Cost comparison against `docs/releases/ci-triage/ci-cost-measurement.md`: replaying the 324 commits in its measurement window (2026-09-07 to 2026-09-21T04:26) through both filters gives 122 governance-only, 86 code-only, 49 both, 67 neither, so the worst case is 122 + 49 = 171 added runner-minutes, 24.4% of the 700 minutes `paths-ignore` removed. **That counterfactual is now moot**: `gh api repos/lowqualityloey/ppl-fitness-tracker` reports `visibility: public`, and GitHub's billing documentation states that standard GitHub-hosted runners in public repositories stay free and do not draw included compute, so this workflow's real cost is zero minutes. The 171-minute figure is retained because it is the number that would apply if the repository returned to private. Measured runtime is ~20 s of validator work (references 15.1-16.4 s, execution-control 4.3-5.9 s, setup-assert 0.05-0.07 s over three runs), which rounds to one billed minute. A first draft of the workflow header claimed 64 minutes / 9.1%; that arithmetic was wrong and is corrected in the file itself.
- [x] **AC-4** (F-2): `docs/specs/2026-11-19-spec-api-suite-hardening.md` states 36 tests, not 31, in the M2 seam-hardening line.
  - **Result**: `PASS`
  - **Evidence**: `grep -cE '^\s+it\(' tests/unit/infra/api-harness.test.ts` → 36; `grep -n '36 tests' docs/specs/2026-11-19-spec-api-suite-hardening.md` → `:345: **Done** — 14 files / 84 tests green, 111.06 s; tests/unit/infra/api-harness.test.ts 36 tests`. The line keeps the 31 as a milestone count with its reason rather than dropping it, so the intermediate state stays visible.
- [x] **AC-5** (F-2): The spec's AC-13 row cites the Task Record for the counts instead of restating `632/638`.
  - **Result**: `PASS`
  - **Evidence**: `grep -c '632/638' docs/specs/2026-11-19-spec-api-suite-hardening.md` → 0; the row at `:383` now reads "the counts and their two measurement dates live in the Task Record's AC-13 evidence, which is the single source for them". The record's AC-13 gained an annotation stating that `663/669` was measured at the 31-test intermediate state and that the same lane reads `668 passed (674)` at the delivered 36.
- [x] **AC-6** (F-2): The Task Record's AC-11 evidence is a diff scoped to `544081d`, not a working-tree status, and it names `560ebde` as the workflow change that rides the branch under `TASK-ci-runtime-reduction`.
  - **Result**: `PASS`
  - **Evidence**: `git diff --stat 544081d^...544081d -- .github/workflows/` → 0 lines. `git diff --stat origin/main...HEAD -- .github/workflows/test.yml` → 1 file, 46 insertions, 4 deletions, attributed by `git log` to `560ebde`. The record's AC-11 keeps its original working-tree evidence verbatim and appends a dated "Correction, 2026-11-22 (branch review F1)" note carrying both measurements, so the original claim is auditable rather than overwritten.
- [x] **AC-7** (F-2): G5 in the spec is scoped to `544081d`, and the record's completion gate says 36 unit tests.
  - **Result**: `PASS`
  - **Evidence**: `grep -n 'G5' docs/specs/2026-11-19-spec-api-suite-hardening.md` → `:143: **G5** — No test body, assertion, budget, threshold, or workflow file changes **in 544081d**.` with the `560ebde` carve-out on the three lines below; the §2 Scope Boundary carries the same carve-out. `grep -n '31 unit tests' docs/tasks/2026-11-19-api-suite-hardening.md` → no match; the completion gate now reads 36 with the 31 kept as the intermediate state. Spec AC-11's evidence was also repointed to the scoped diff, which is the same claim at its second site.
- [ ] **AC-8** (F-3): `docs/STATE.md` is main's split tracker with section 3A re-added, and the projection still agrees with its canonical record.
  - **Result**: `PASS` - satisfied at `cd745d2`: `docs/STATE.md` is 224 lines against main's 188-line skeleton plus `docs/STATE-ARCHIVE.md` (2724 lines), section 3A sits at line 66 and names `TASK-promptkit-v2-4-upgrade`, `git rev-list --left-right --count origin/main...HEAD` reads `0 21`, and `check-doctor` reports `docs-drift OK`.
  - **Evidence**: `git rev-list --left-right --count origin/main...HEAD; wc -l docs/STATE.md docs/STATE-ARCHIVE.md; grep -n '3A\. Execution-Control' docs/STATE.md; bash .promptkit/scripts/check-doctor.sh .`
- [ ] **AC-9** (F-3): `docs/STATE.md` section 9 is one five-column table, so the validator's orphan-row and column checks pass.
  - **Result**: `PASS` - satisfied at `cd745d2`: main's two one-row tables separated by a blank line became a single table holding both rows, and `validate-execution-control.sh --root .` returns `VALID|RECORDS=7|ROOT=.` exit 0.
  - **Evidence**: `bash .promptkit/scripts/validate-execution-control.sh --root .`
- [x] **AC-10** (F-4): `tests/integration/api/fixtures.ts` defines no anon-key fallback and assigns nothing to `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - **Result**: `PASS` - satisfied this session: the `SUPABASE_ANON_KEY` const and the `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=` line are both gone, and the variable now survives only as a required-environment entry, so a missing key fails loudly at collection time instead of being invented.
  - **Evidence**: `grep -n 'SUPABASE_ANON_KEY' tests/integration/api/fixtures.ts` returns two hits, both prose or configuration and neither a fallback: `:66` inside the doc comment that explains the asymmetry, and `:120` the `REQUIRED_ENV` tuple `['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon key for the spawned server and the cookie jar — from .env.local']`. `grep -c 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=' tests/integration/api/fixtures.ts` returns 0. The remaining `process.env` write is `process.env.NEXT_PUBLIC_SUPABASE_URL ??= SUPABASE_URL;`, which is an address with one obvious local answer and not a credential.
- [x] **AC-11** (F-4): `scripts/preflight.ts` fails with a named error when `NEXT_PUBLIC_SUPABASE_ANON_KEY` is absent, so the guard survives the removal of the fallback.
  - **Result**: `PASS` - satisfied this session: two checks were added ahead of the GoTrue probe, one that fails on an absent, empty, or `REPLACE_ME` key and one that reports the app URL without ever failing it.
  - **Evidence**: three runs of `scripts/preflight.ts` with dummy `DATABASE_URL` and `MIGRATION_DATABASE_URL` values (no `.env` read, no secret printed; the two app-role FAILs are artefacts of the dummy password and are expected). (a) `env -u NEXT_PUBLIC_SUPABASE_ANON_KEY -u NEXT_PUBLIC_APP_URL` exits 1 with `FAIL  anon key present (NEXT_PUBLIC_SUPABASE_ANON_KEY) — NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. The API suite no longer substitutes a local-development key, so `npm run test:api` fails in globalSetup with a readiness error that looks like a server bug. Add it to .env.local (values: `npm run db:status`).` (b) `NEXT_PUBLIC_SUPABASE_ANON_KEY=REPLACE_ME` exits 1 with the separate placeholder error. (c) `NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-from-operator` reports `ok  anon key present (NEXT_PUBLIC_SUPABASE_ANON_KEY) — present (03eddda6f53c, len 18)` plus `ok  app URL (NEXT_PUBLIC_APP_URL) — not set — the harness will use http://127.0.0.1:3101`. Only the digest and the length are printed, never the key.
- [x] **AC-12** (F-4): `npm run test:api` still returns 14 files / 84 tests green with the key set, so the removal does not break the reachable-stack path.
  - **Result**: `PASS` - satisfied this session, and the pre-change baseline proves the removal cost nothing: the same lane measured 14 files / 84 tests green before the edit and after it.
  - **Evidence**: before the edit, `npm run test:api` → `Test Files  14 passed (14)`, `Tests  84 passed (84)`, duration 112.60 s, start 23:40:20. After the edit, the same command → `Test Files  14 passed (14)`, `Tests  84 passed (84)`, duration 95.98 s, start 23:46:23, with the local stack reachable (GoTrue `/auth/v1/health` 200). `npm run typecheck` exits 0 and `npx eslint --max-warnings=0 .` exits 0 with no output.
- [x] **AC-13** (F-5): A separate Task Record exists for the six pre-existing Drizzle/RLS failures, reproducing them from `81fdd3c`'s dependency move rather than describing them.
  - **Result**: `PASS` - satisfied this session: `docs/tasks/2026-11-22-drizzle-rls-failures.md` exists, owns both halves (the six assertion failures and the owned-child leak), and establishes pre-existence by measurement rather than by description.
  - **Evidence**: the record reproduces the failures at HEAD `833d05c` against a reachable stack - `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/tenancy.test.ts tests/integration/rls-user-data-tables.test.ts` printed `Test Files  2 failed (2)`, `Tests  6 failed | 34 passed (40)`, Start 00:04:38, Duration 3.72s - and attributes them to `81fdd3c` from `git show 81fdd3c^:package.json` (`"drizzle-orm": "^0.36.4"`, `"vitest": "^5.0.0"`) against `git show 81fdd3c:package.json` (`^0.45.4`, `^5.0.5`), plus `git show --name-only --format='' 81fdd3c` touching no test file and `git log --oneline 81fdd3c..HEAD -- tests/integration/tenancy.test.ts tests/integration/rls-user-data-tables.test.ts` returning 0 commits. Root cause is taken from the printed diff, not the version number: a `DrizzleQueryError` whose `cause.code` holds the SQLSTATE. Its own gate result: `validate-execution-control.sh --root .` exits 0 with `VALID` over 9 records (was 8 before the record).
- [x] **AC-14** (F-5): `tests/integration/api/test-server.ts` stops the owned child when its spawn fails, so a failed boot cannot leave `next dev` holding port 3101.
  - **Result**: `PASS` - satisfied at 83d9aed, measured in the record that owns it rather than re-described here.
  - **Evidence**: `TASK-drizzle-rls-failures AC-9 and AC-10 carry the proof: a node:net blocker on API_TEST_PORT that accepted and never answered made next dev exit 1 on EADDRINUSE, startApiServer() rejected with "exited before readiness", and nothing was listening on 3101 afterwards; the owned path's SIGINT/SIGTERM cleanup was proven with newListener/removeListener printing added then removed for both signals with both listener counts back at 0. This criterion defers to that record, so it closes on its evidence, not on a second copy.`
- [ ] **AC-15** (scope): No application source, schema, auth, API, database, or runtime file changed, and `test.yml`'s `paths-ignore` cost control is untouched.
  - **Result**: `Pending`
  - **Evidence**: will be `git diff --name-only <base>..HEAD | grep -E '^(app|lib|src|components|supabase)/'` returning nothing and `git diff <base>..HEAD -- .github/workflows/test.yml` returning nothing

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A - each item needs its own go-ahead; the record authorizes nothing by itself`
- **Authorization Checkpoint Reference**: `N/A - pre-PR`
- **Soft Checkpoint**: `Around 60 minutes of execution, or at the first code item (F-4 or F-5's leak), whichever comes first`
- **Hard Checkpoint**: `At or before 90 minutes, or before any commit if a gate is red for a reason this record did not cause`
- **Event-Driven Checkpoints**: `Milestone, task switch, scope expansion, handoff, compaction, or context drift`
- **Stop Conditions**: `Missing go-ahead for an individual item; F-4 attempted without a reachable Supabase stack, because the green lane cannot be re-measured; F-1 attempted without a cost comparison against the paths-ignore measurement; an unexpected file in a diff-scope gate; a failed governance gate not covered by a recorded red; hard checkpoint; developer stop`
- **Host Timer Capability**: `The host cannot mechanically enforce checkpoints or terminate the session; timing is recorded, never enforced.`

## 5. State and Active Ownership

- **Execution State**: `awaiting_review`
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-11-22 09:33 UTC`
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: `AC-14 now reads PASS on the Drizzle/RLS record's measurement. AC-15 remains Pending and is not claimable as worded: the application-directory probe returns 0, but `git diff origin/main...HEAD -- .github/workflows/test.yml` returns 1 file because 560ebde carries the intentional paths-ignore change under TASK-ci-runtime-reduction. The owner must scope AC-15 to this record's change set or to the branch; until then the record stays awaiting_review at fourteen of fifteen.`
- **Branch / Revision**: `chore/promptkit-v2-sync @ 7820617`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `None` | `planned` | 2026-11-22 08:45 UTC | Agent (DeepSeek Harness / lead) | Owner instruction at m03192 ("do next steps 1 and 3") asked for this record and for F-3; F-3 was executed first because the merge was already in progress, and this record registers the five findings as tracked work | section 2 Objective; section 3 Acceptance Criteria |
| `planned` | `in_progress` | 2026-11-22 09:33 UTC | Agent (DeepSeek Harness / lead) | Owner instruction at m03699 ("1") selected the offered next step, executing F-2; the record takes the active pointer because F-2 is work under it and the remaining items stay open | AC-4 through AC-7 PASS; section 6 Verification Evidence |
| `in_progress` | `awaiting_review` | 2026-11-23 01:05 UTC | Agent (DeepSeek Harness / lead) | Every item this record can execute alone is done (AC-1 to AC-13 PASS). Its two remaining criteria both depend on the separate Drizzle/RLS record: AC-14 needs that record's owned-child fix, and AC-15 is a close-time scope claim that cannot be made while another record is mid-flight. The pointer moves to TASK-drizzle-rls-failures at m04497, so this record yields it rather than sitting in_progress beside it (which the validator rejects as ACTIVE_TASK_CONFLICT) | AC-14 and AC-15 read Pending; docs/tasks/2026-11-22-drizzle-rls-failures.md AC-9 and AC-10 PASS |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `.github/workflows/governance.yml` - the governance workflow F-1 adds
  - `docs/specs/2026-11-19-spec-api-suite-hardening.md` - F-2 corrections
  - `docs/tasks/2026-11-19-api-suite-hardening.md` - F-2 corrections
  - `tests/integration/api/fixtures.ts` - F-4 fallback removal
  - `scripts/preflight.ts` - F-4 anon-key check
  - `tests/integration/api/test-server.ts` - F-5 owned-child leak
  - `docs/tasks/` - the separate F-5 record
  - `docs/STATE.md` - section 1, section 3A and section 8 rows
  - `docs/tasks/2026-11-22-branch-review-follow-ups.md` - this record
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `F-2 measured 2026-11-22 09:33 UTC on a08edf9 with the F-2 edits applied: grep -cE '^\s+it\(' tests/unit/infra/api-harness.test.ts = 36; grep -c '632/638' docs/specs/2026-11-19-spec-api-suite-hardening.md = 0; grep '31 unit tests' docs/tasks/2026-11-19-api-suite-hardening.md = no match; git diff --stat 544081d^...544081d -- .github/workflows/ = 0 lines. F-1 measured 2026-11-22 10:10 UTC at 766c55f: the workflow parses with four steps and `timeout-minutes: 5`; actionlint 1.7.7 exits 0 on it and on test.yml; a path-filter replay of all 23 origin/main..HEAD commits puts governance at 22 of 23 against test.yml's 6 of 23; and the same three validators were proven to pass in a `--depth 1 --shallow-submodules` clone, so no fetch-depth is needed. Gates after the edits: validate-references.sh --strict exit 0 (420 markdown files valid); validate-execution-control.sh --root . exit 0 VALID|RECORDS=8|ROOT=.; check-setup-assert.sh . .promptkit .promptkit exit 0 ASSERT|submodule|status|OK. The pre-work baseline at cd745d2 was the same three gates green, with check-doctor exit 1 on version STALE(+12) alone with submodule OK and docs-drift OK. F-4 measured 2026-11-22 23:48 UTC at 7b5c3ac with the F-4 edits applied: the anon-key const and its `process.env` assignment are gone from tests/integration/api/fixtures.ts (grep finds only the doc comment at :66 and the REQUIRED_ENV tuple at :120; `??=` count is 0); three preflight runs prove the new check fails on an absent key, fails on the `REPLACE_ME` placeholder, and passes on a supplied key while reporting the app URL without failing it; and `npm run test:api` returns 14 files / 84 tests green, unchanged from the 14 / 84 baseline taken before the edit. `npm run typecheck` exits 0 and `npx eslint --max-warnings=0 .` exits 0. F-5's record was then authored at 833d05c: docs/tasks/2026-11-22-drizzle-rls-failures.md reproduces the six failures against a reachable stack (2 files failed, 6 failed | 34 passed of 40 in 3.72s), proves pre-existence from the 81fdd3c package.json diff, and takes the root cause from the printed DrizzleQueryError rather than the version number. Gates after that record: validate-references --strict exit 0 over 420 markdown files; validate-execution-control --root . exit 0 with VALID over 9 records. AC-14 and AC-15 read Pending by design.`
- **Behavior IDs [Required when enabled]**: `N/A - exception work type`
- **TDD Intent Register [Required when enabled]**: `N/A - exception work type`
- **TDD Execution Evidence [Required when enabled]**: `N/A - exception work type`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `The documentation and configuration items have no behaviour seam to drive Red-Green-Refactor; their verification is the governance gate sweep plus the per-item commands in section 3. F-4 and the F-5 child leak do change code, so each must state its own TDD decision before it executes and may not inherit this record's disabled mode by default.`
- **CI Evidence**: `No CI run exists for this branch: it has not been pushed and no pull request is open, so neither workflow has executed on it. F-1's evidence is therefore local - actionlint, a YAML parse, a path-filter replay of the branch's own commits, and the three validators run in a shallow clone that reproduces the runner's checkout shape. The workflow's first real run will be the first push that touches a governance path.`
- **Review Evidence**: `docs/reviews/2026-11-22-promptkit-v2-sync-branch.md - a Level 2 review of the branch with verdict Changes Requested and no BLOCKING findings. Its own findings are F1 the AC-11 working-tree evidence, F2 the fixtures.ts anon key, F3 the owned-path child leak, F4 the stale STATE 3A and F5 the AC-13 counts; those map onto this record's F-2, F-4, F-5 and F-3. F-1 is not in the review - it comes from section 9 of the specification (follow-ups this plan does not do) - see the Provenance Note in section 2. The report is currently untracked; committing it is a separate step the owner has not authorized.`
- **Commit Evidence**: `cd745d2 chore(state): merge origin/main and reconcile the split tracker - F-3, 6 files. a08edf9 docs(promptkit): register the branch review follow-ups - this record plus the §3A repoint, 2 files. 766c55f docs(api-suite): correct the three falsified or unscoped claims (branch review F-2) - 4 files, 50 insertions, 40 deletions. 7b5c3ac ci(governance): run the PromptKit validators on governance-only changes (branch review F-1) - 3 files, 156 insertions, 29 deletions. F-4 lands as one further test(api) commit on this branch; a commit cannot name its own SHA, so it is identified by subject. F-5 has no commit; this pass commits the F-5 Task Record and the AC-13 tick as one further docs commit, identified by subject because a commit cannot name its own SHA.`
- **Pull Request Evidence**: `N/A - no pull request was opened for this branch; work is reviewed on the local branch (human-confirmed at m03192)`
- **Release Evidence**: `N/A - no release, tag, or deployment action is in scope`
- **Blocker and Resume Condition**: `Nothing is blocked for AC-14: the owned-child fix landed at 83d9aed and is proven in TASK-drizzle-rls-failures AC-9 and AC-10. AC-15 needs one owner decision - whether it is scoped to this record's change set (where it passes: no application directory, no test.yml change) or to the branch (where it cannot pass, because 560ebde changes test.yml under TASK-ci-runtime-reduction).`

## 7. Completion Gate

- **Completion State**: `N/A - record is awaiting_review; F-1 through F-5 are done and AC-14 now closes on the Drizzle/RLS record's evidence, but AC-15 needs the owner's scoping decision before it can be claimed`
- **Acceptance Results**: `Fourteen of fifteen criteria read PASS: AC-1, AC-2 and AC-3 on F-1, AC-4 through AC-7 on F-2 landed at 766c55f, AC-8 and AC-9 on F-3 landed at cd745d2, AC-10 through AC-12 on F-4, and AC-13 because docs/tasks/2026-11-22-drizzle-rls-failures.md now exists with the reproduction and the 81fdd3c attribution. AC-14 now reads PASS on TASK-drizzle-rls-failures AC-9/AC-10; AC-15 remains Pending for the reason in its Blocker and Resume Condition, and it is not claimed.`
- **Changed-File Summary**: `F-2 changed two documents: docs/specs/2026-11-19-spec-api-suite-hardening.md (M2's test count, G5's scope plus the 560ebde carve-out, the §2 Scope Boundary sentence, the AC-11 evidence, the AC-13 row) and docs/tasks/2026-11-19-api-suite-hardening.md (AC-11's correction note, AC-13's annotation, the Acceptance Results count). F-1 adds one new file, .github/workflows/governance.yml, and changes nothing else - test.yml is untouched, which is the point of AC-15. F-4 changed two files: tests/integration/api/fixtures.ts (the anon-key const, the `process.env` assignment, and a new REQUIRED_ENV entry) and scripts/preflight.ts (two checks plus the header paragraph that explains why). No application source, schema, auth, API, database, or runtime file changed in any of F-1, F-2 or F-4, which is AC-15's claim.`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `N/A - no completion decision has been taken`

A task may be marked `completed` only after acceptance results, verification evidence, changed-file summary, and required commit evidence are linked. This record authorizes nothing beyond the Approval Boundary in section 1.
