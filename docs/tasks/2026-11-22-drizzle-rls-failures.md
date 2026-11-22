# Task Record: Reproduce and clear the six Drizzle/RLS failures and the owned-child leak

<a id="TASK-drizzle-rls-failures"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-drizzle-rls-failures`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Code Work`
- **Work Type Note**: The two halves are different kinds of code change. The six failures are a test-assertion repair - the database still raises `42501` and `22P02`, but `drizzle-orm` 0.45.x wraps the driver error in a `DrizzleQueryError`, so the matcher no longer sees the SQLSTATE at the top level. The owned-child leak is a lifecycle repair in the harness, not a test change. Neither touches application source.
- **Planning Record Link**: [PLAN-api-suite-hardening](../specs/2026-11-19-spec-api-suite-hardening.md#PLAN-api-suite-hardening)
- **Planning Depth Reference**: `Minimal`
- **Assumption Record Links**: `None`
- **Specification**: `docs/specs/2026-11-19-spec-api-suite-hardening.md`
- **External Reference**: `N/A - local Markdown tracking; no issue filed`
- **Owner / Actor**: `Agent (DeepSeek Harness / lead)`
- **Execution Scope**: `ppl-fitness-tracker, branch chore/promptkit-v2-sync, one worktree`
- **Approval Boundary**: `The owner's instruction at m04215 authorizes opening this record, reproducing the six failures from 81fdd3c, and writing the record itself. It explicitly does not authorize implementing either fix ("Do not implement the fixes yet"), and it forbids touching application source or .github/workflows/test.yml. Each fix needs a fresh go-ahead. Commit, push, PR, merge, tag, release, deploy, and any action outside this repository require explicit human confirmation.`
- **Created**: `2026-11-22 11:20 UTC`

> This Local Task Source is authoritative for Controlled Work. The Planning Record supplies context only; it does not control readiness, execution state, active ownership, completion, or approval.

## 2. Objective and Boundaries

- **Objective**: `Turn two long-carried findings into work that can be closed on measurement rather than description: the six pre-existing Drizzle/RLS assertion failures in tests/integration/tenancy.test.ts and tests/integration/rls-user-data-tables.test.ts, reproduced from the dependency move at 81fdd3c and traced to drizzle-orm 0.45.x wrapping driver errors; and the owned-child leak at tests/integration/api/test-server.ts:184-194, where the catch block clears the module handle before throwing without awaiting server.stop(), so stopApiServer() no-ops and an interrupted direct run leaves next dev holding port 3101.`
- **In Scope**:
  - `tests/integration/tenancy.test.ts` - the four failing assertions that match `code: '42501'` or `code: '22P02'` on the rejection's top level
  - `tests/integration/rls-user-data-tables.test.ts` - the two failing owner-attribution cases in the same assertion class
  - `tests/integration/api/test-server.ts` - the owned-child leak at `:184-194` and the missing signal cleanup on the owned path
  - `tests/integration/test-helpers.ts` - a shared assertion helper, only if the assertion repair is deduplicated rather than repeated at each site; adding it requires a Scope Change Record first
  - `docs/tasks/2026-11-22-drizzle-rls-failures.md` - this record
  - `docs/STATE.md` - the section 3A projection and the section 8 session row
- **Provenance Note**: `Neither half is new. The six failures have been attributed to 81fdd3c in three places since 2026-11-20 (docs/specs/2026-11-19-spec-api-suite-hardening.md:153-154, docs/tasks/2026-11-19-api-suite-hardening.md:45, docs/tasks/2026-11-22-promptkit-v2-4-upgrade.md:44) and no record has ever owned them. The leak is finding F3 of docs/reviews/2026-11-22-promptkit-v2-sync-branch.md:130-161, raised because the harness ACs "stop() returns only after the child is gone" and "an interrupted run leaves no orphan" hold on the shared path and fail on the owned path. This record exists because docs/tasks/2026-11-22-branch-review-follow-ups.md AC-13 and AC-14 both defer to a separate record and cannot pass without one.`
- **Explicit Non-Goals**:
  - Implementing either fix in this pass; the owner said not to, and the record is authored as `planned`
  - Any application source, schema, auth, API, database, or runtime change
  - Changing `.github/workflows/test.yml`, including its `paths-ignore` cost control
  - Pinning `drizzle-orm` or `vitest` back to their pre-81fdd3c versions; the upgrade is not the defect, the assertion shape is
  - Weakening or deleting an assertion so the suite goes green without proving the security property still holds
  - Reopening findings the branch review already closed, or re-reviewing the branch
  - Release, tag creation, publication, deployment, or any remote action
- **Dependencies**: `A reachable local Supabase stack. It was reachable when this record was measured - GoTrue answered 200 on http://127.0.0.1:54321/auth/v1/health and 54321/54322 were listening - but it was NOT reachable on 2026-11-20, when the same suite recorded 130 skips and connect ECONNREFUSED 127.0.0.1:54322. The reproduction must therefore be re-established, never assumed. The six failures also depend on `drizzle-orm` 0.45.4 remaining installed, since the wrapping behaviour is the cause.`
- **Risk**: `Medium. The assertion repair is easy to get wrong in a way that hides a real regression: a matcher that accepts any `DrizzleQueryError` would pass whether the database refused the write or the connection dropped, so the fix must assert on `cause.code` and keep the test able to fail. The leak repair changes shared harness teardown used by all thirteen API test files, so a mistake turns a clean exit into a hung or double-stopped child. The reproduction itself carries no risk.`
- **Verification Condition**: `For the reproduction: `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/tenancy.test.ts tests/integration/rls-user-data-tables.test.ts` reports exactly 6 failed and 34 passed on 40 tests against a reachable stack, and the printed diffs show a `DrizzleQueryError` whose `cause.code` holds the SQLSTATE. For the fixes, when authorized: those two lanes green, `npm test` no worse than its 6 failed / 668 passed baseline, and the harness leak proven closed by a failed boot that leaves port 3101 free. Gates at every step: `validate-references.sh --strict`, `validate-execution-control.sh --root .`, `check-setup-assert.sh . .promptkit .promptkit`, `check-doctor.sh .`, `npm run typecheck`, `npx eslint --max-warnings=0 .`.`

## 3. Acceptance Criteria

- [x] **AC-1** (reproduce): The six failures reproduce on the current branch against a reachable stack, at the documented count.
  - **Result**: `PASS`
  - **Evidence**: `Measured 2026-11-23 00:04 local at HEAD 833d05c with GoTrue answering 200 on http://127.0.0.1:54321/auth/v1/health and 54321/54322 listening: `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/tenancy.test.ts tests/integration/rls-user-data-tables.test.ts` printed `Test Files  2 failed (2)`, `Tests  6 failed | 34 passed (40)`, Start at 00:04:38, Duration 3.72s. The six are: tenancy.test.ts "should reject inserting workout session attributed to B (42501, not silent drop)"; "should reject inserting session set attributed to B (42501, not silent drop)"; "No claims scenario > should error on garbage sub, not open door"; "Scenario 2: Harness validity > should verify app role cannot reach auth schema directly"; and rls-user-data-tables.test.ts "rejects inserts or relationship changes that attribute rows to B" and "rejects reassigning an owner row or task relationship to B".`
- [x] **AC-2** (pre-existence): The failures are attributed to 81fdd3c by measurement, not by assertion.
  - **Result**: `PASS`
  - **Evidence**: ``git show 81fdd3c^:package.json` has `"drizzle-orm": "^0.36.4"` and `"vitest": "^5.0.0"`; `git show 81fdd3c:package.json` has `^0.45.4` and `^5.0.5`; the installed tree resolves drizzle-orm 0.45.4. `git show --stat --format='%h %s' 81fdd3c` is `81fdd3c fix(deps): upgrade drizzle-orm to 0.45.4 and vitest to 5.0.5` with package-lock.json 849 changed, package.json 4 changed, 740 insertions, 113 deletions, and `git show --name-only --format='' 81fdd3c | grep -E 'tenancy|rls-user'` returns nothing, so the commit touched no test file. `git log --oneline 81fdd3c..HEAD -- tests/integration/tenancy.test.ts tests/integration/rls-user-data-tables.test.ts` returns 0 commits, so both lanes are byte-identical to their pre-upgrade state; their last authors are b916f77 (2026-09-08) and 72a45d6 (2026-09-09), both predating the upgrade. `git merge-base --is-ancestor 81fdd3c HEAD` exits 0.`
- [x] **AC-3** (root cause): The mechanism is identified from the failure output, not inferred from the version number.
  - **Result**: `PASS`
  - **Evidence**: `The printed diff for the 22P02 case received `DrizzleQueryError { message: 'Failed query: select "id", "user_id", "session_id", "exercise_id", "set_index", "is_completed", "weight_kg", "reps", "client_ts", "updated_at" from "session_sets"', params: [], query: 'select … from "session_sets"', cause: error { message: 'invalid input syntax for type uuid: "not-a-uuid"', code: '22P02', severity: 'ERROR', file: 'uuid.c', line: '138', routine: 'string_to_uuid' } }`. The SQLSTATE is on `.cause.code`, one level below what `rejects.toMatchObject({ code: '22P02' })` inspects. drizzle-orm 0.45.x wraps the pg driver error rather than rethrowing it. The database still refuses the write, so this is an assertion-shape change and not a behaviour regression.`
- [x] **AC-4** (site inventory): Every assertion that can fail this way is inventoried, not just the six that currently do.
  - **Result**: `PASS`
  - **Evidence**: ``grep -nE '42501|22P02'` finds 7 hits in tests/integration/tenancy.test.ts (at :326, :441, :442, :454, :470, :503) and 20 in tests/integration/rls-user-data-tables.test.ts (at :686, :699, :708, :716, :724, :732, :741, :749, :757, :765, :773, :781, :822, :833, :845, :857, :868, :874, :884, :893), so 27 sites share the class. Only 6 fail today because the rest sit on skipped cases or on a path that still surfaces the raw error. A fix that repairs only the six failing assertions leaves 21 latent sites.`
- [ ] **AC-5** (repair decision): The repair approach is chosen and recorded before any assertion is edited.
  - **Result**: `Pending`
  - **Evidence**: `To be recorded when authorized: either a shared helper in `tests/integration/test-helpers.ts` that asserts the SQLSTATE at `cause.code` and is adopted at all 27 sites, or an inline change at each site. The helper needs a Scope Change Record first because that path is conditional in section 2.`
- [ ] **AC-6** (tenancy lane): The four failing assertions in tests/integration/tenancy.test.ts pass against a reachable stack, and still fail if the SQLSTATE is wrong.
  - **Result**: `Pending`
  - **Evidence**: `To be measured when authorized, by the same command as AC-1 plus a deliberate wrong-SQLSTATE probe proving the repaired matcher can still go red.`
- [ ] **AC-7** (rls lane): The two failing cases in tests/integration/rls-user-data-tables.test.ts pass, on the same terms as AC-6.
  - **Result**: `Pending`
  - **Evidence**: `To be measured when authorized, by the same command as AC-1 plus the same wrong-SQLSTATE probe.`
- [ ] **AC-8** (property preserved): No assertion is deleted or loosened into accepting any error.
  - **Result**: `Pending`
  - **Evidence**: `To be shown when authorized: a diff review proving each repaired matcher still constrains the SQLSTATE, plus one probe per lane that a connection failure or a different SQLSTATE does not satisfy it.`
- [ ] **AC-9** (owned-child leak): tests/integration/api/test-server.ts stops the owned child when its spawn or readiness wait fails, so a failed boot cannot leave next dev holding port 3101.
  - **Result**: `Pending`
  - **Evidence**: `To be shown when authorized: the catch at `:189-194` awaits `server.stop()` before rethrowing, and a forced readiness failure leaves nothing listening on 3101 (`ss -ltnp | grep 3101` empty) instead of surviving until waitForReady's deadline SIGKILL at tests/integration/api/server-process.ts:571.`
- [ ] **AC-10** (owned-path signals): The owned path installs the same SIGINT/SIGTERM cleanup the shared path gets from globalSetup, so an interrupt does not leak the child indefinitely.
  - **Result**: `Pending`
  - **Evidence**: `To be shown when authorized, mirroring `installSignalCleanup` as used at tests/integration/api/global-setup.ts:59 and the teardown shapes at `:133-140`, `:155-158` and `:181-182`, with an interrupt probe that leaves no orphan.`
- [ ] **AC-11** (no new failure): The full suite is no worse than its measured baseline.
  - **Result**: `Pending`
  - **Evidence**: `To be measured when authorized against the 2026-11-22 baseline of 2 failed / 65 passed (67) files and 6 failed / 668 passed (674) tests; the expectation is 0 failed in those two files and no new failure elsewhere.`
- [ ] **AC-12** (gates): Every governance gate stays green except the accepted doctor row.
  - **Result**: `Pending`
  - **Evidence**: `To be measured when authorized: validate-references --strict exit 0, validate-execution-control --root . exit 0 with VALID over 9 records, check-setup-assert exit 0, check-doctor exit 1 on version STALE(+12) alone with submodule OK and docs-drift OK, npm run typecheck exit 0, npx eslint --max-warnings=0 . exit 0.`
- [ ] **AC-13** (scope): No application source, schema, auth, API, database, or runtime file changed, and test.yml's paths-ignore cost control is untouched.
  - **Result**: `Pending`
  - **Evidence**: `To be shown when authorized by `git diff --name-only` over the change set, restricted to tests/ and docs/.`
- [x] **AC-14** (this pass): Authoring this record changed no source file.
  - **Result**: `PASS`
  - **Evidence**: `The only file written in this pass is `docs/tasks/2026-11-22-drizzle-rls-failures.md`. No test, script, workflow, schema, or application file was modified, which is what the owner's "do not implement the fixes yet" required.`

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A - each half needs its own go-ahead; the record authorizes nothing by itself`
- **Authorization Checkpoint Reference**: `N/A - pre-PR`
- **Soft Checkpoint**: `Around 60 minutes of execution, or at the first edited assertion, whichever comes first`
- **Hard Checkpoint**: `At or before 90 minutes, or before any commit if a gate is red for a reason this record did not cause`
- **Event-Driven Checkpoints**: `Milestone, task switch, scope expansion, handoff, compaction, or context drift`
- **Stop Conditions**: `Missing go-ahead for either half; the Supabase stack unreachable, because the reproduction cannot be re-established and a skipped suite would read as green; a repaired matcher that passes a wrong-SQLSTATE probe; an unexpected file in the diff-scope gate; a failed governance gate not covered by a recorded red; hard checkpoint; developer stop`
- **Host Timer Capability**: `The host cannot mechanically enforce checkpoints or terminate the session; timing is recorded, never enforced.`

## 5. State and Active Ownership

- **Execution State**: `planned`
- **Mapped `pk:tasks` Status**: `To Do`
- **Active Task Pointer**: `None`
- **Start Time**: `None - the record has not started; it is planned`
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: `Await the owner's go-ahead for the assertion repair. AC-1 through AC-4 and AC-14 already read PASS on measurement taken while authoring; AC-5 must be decided before any assertion is edited, and the owned-child leak (AC-9, AC-10) is independent of the assertion work and can be taken separately.`
- **Branch / Revision**: `chore/promptkit-v2-sync @ 833d05c`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `None` | `planned` | 2026-11-22 11:20 UTC | Agent (DeepSeek Harness / lead) | Owner instruction at m04215 asked for a separate Task Record covering the six Drizzle/RLS failures and the owned-child leak, with no fixes implemented | section 2 Objective; section 3 AC-1 through AC-4 |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `docs/tasks/2026-11-22-drizzle-rls-failures.md` - this record
  - `tests/integration/tenancy.test.ts` - the four failing assertions, when authorized
  - `tests/integration/rls-user-data-tables.test.ts` - the two failing cases, when authorized
  - `tests/integration/api/test-server.ts` - the owned-child leak and signal cleanup, when authorized
  - `docs/STATE.md` - the section 3A projection and the section 8 session row
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `Measured 2026-11-23 00:04 local at 833d05c, stack reachable: 2 files failed, 6 failed and 34 passed of 40 tests in 3.72s. Pre-existence established by the 81fdd3c^ versus 81fdd3c package.json diff, by 81fdd3c touching no test file, and by zero commits to either lane since. Root cause established from the printed DrizzleQueryError diff. Assertion inventory is 27 sites across the two files. Gates after authoring: validate-references.sh --strict exit 0 over 420 markdown files; validate-execution-control.sh --root . exit 0 VALID over 9 records (was 8 before this record).`
- **Behavior IDs [Required when enabled]**: `N/A - TDD Enforcement Mode is disabled`
- **TDD Intent Register [Required when enabled]**: `N/A - TDD Enforcement Mode is disabled`
- **TDD Execution Evidence [Required when enabled]**: `N/A - TDD Enforcement Mode is disabled`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `N/A - Code Work`
- **CI Evidence**: `No CI run exists for this branch: it has not been pushed and no pull request is open. The reproduction was run locally against the local Supabase stack, which is the same path the suite takes under CI except that CI supplies its own anon and service-role keys at job level.`
- **Review Evidence**: `docs/reviews/2026-11-22-promptkit-v2-sync-branch.md finding F3 (lines 130-161) for the owned-child leak; finding S5 (lines 374-376) and lines 173-180 for 81fdd3c having no owning record. Both are consumed here rather than re-reviewed. The report is currently untracked.`
- **Commit Evidence**: `N/A - this pass committed nothing; the record is authored uncommitted for owner review`
- **Pull Request Evidence**: `N/A - no pull request was opened for this branch; work is reviewed on the local branch (human-confirmed at m04215)`
- **Release Evidence**: `N/A - no release, tag, or deployment action is in scope`
- **Blocker and Resume Condition**: `Blocked on owner go-ahead. Resume with the assertion repair (AC-5 first, then AC-6 through AC-8) or with the owned-child leak (AC-9, AC-10), which needs no stack and can run on its own.`

## 7. Completion Gate

- **Completion State**: `N/A - record is planned; no fix has been implemented and the owner asked for none yet`
- **Acceptance Results**: `Five of fourteen criteria read PASS on measurement taken while authoring: AC-1 (the six failures reproduce), AC-2 (pre-existence proven from 81fdd3c), AC-3 (root cause proven from the failure output), AC-4 (27 assertion sites inventoried), and AC-14 (this pass changed no source file). AC-5 through AC-13 read Pending; none was evaluated and none is claimed.`
- **Changed-File Summary**: `One file added: docs/tasks/2026-11-22-drizzle-rls-failures.md. No test, script, workflow, schema, or application file was touched, so the fix work described in section 2 is entirely still ahead.`
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `N/A - no completion decision has been taken`

A task may be marked `completed` only after acceptance results, verification evidence, changed-file summary, and required commit evidence are linked. This record authorizes nothing beyond the Approval Boundary in section 1.
