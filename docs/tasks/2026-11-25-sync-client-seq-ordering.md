# Task Record: Order same-millisecond writes by the client's outbox sequence

<a id="TASK-sync-client-seq-ordering"></a>

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-sync-client-seq-ordering`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Code Work`
- **Planning Record Link**: [PLAN-sync-client-seq-ordering](../specs/2026-11-25-spec-sync-client-seq-ordering.md#PLAN-sync-client-seq-ordering)
- **Planning Depth Reference**: `Full`
- **Assumption Record Links**: `None`
- **Specification**: `docs/specs/2026-11-25-spec-sync-client-seq-ordering.md`
- **External Reference**: `https://github.com/lowqualityloey/ppl-fitness-tracker/issues/78`
- **Owner / Actor**: `Agent (DeepSeek Harness / lead)`
- **Execution Scope**: `ppl-fitness-tracker, branch main, one worktree`
- **Approval Boundary**: `Owner authorization of issue #78 option 1 (thread the outbox sequence into the conflict comparison) with the Level 2 ceremony was given before this record existed. Commit, push, PR, merge, tag, release, deploy, and any action outside this repository require explicit human confirmation.`
- **Created**: `2026-11-25 13:45 UTC`

> This Local Task Source is authoritative for Controlled Work. The Planning Record supplies context only; it does not control readiness, execution state, active ownership, completion, or approval.

## 2. Objective and Boundaries

- **Objective**: `Order two mutations for the same entity that land in the same millisecond by the client's monotonic per-session outbox sequence instead of a random UUID, so the server keeps the tap the athlete made last.`
- **In Scope**:
  - `lib/contracts/sync.ts` - optional `clientSeq` on the mutation identity shape
  - `lib/domain/sync/sync-engine.ts` - comparison order and candidate/upsert construction
  - `lib/domain/sync/types.ts` - `SyncEntityVersion.clientSeq`
  - `lib/repositories/workout-repository.ts` - row mapping, three zero-version fallbacks, upsert, flush set list
  - `db/schema/index.ts` - `client_seq` column and named check
  - `supabase/migrations/0009_sync_entity_client_seq.sql` - additive migration
  - `src/app/state/sync-engine.ts` - re-attach the stored `seq` at send time
  - `tests/unit/domain/sync-engine.test.ts` - the ordering proof
  - `tests/unit/contracts/contracts.test.ts` - optional-field compatibility
  - `tests/integration/repository/workout-repository.test.ts` - storage round trip
  - `docs/specs/2026-11-25-spec-sync-client-seq-ordering.md` - the Planning Record this task consumes
  - `docs/tasks/2026-11-25-sync-client-seq-ordering.md` - this Task Record
  - `docs/STATE.md` - the open-findings bullet and the last-updated head
- **Explicit Non-Goals**:
  - Sub-millisecond client timestamps, or any change to what `clientTs` means
  - Treating a same-millisecond same-device write as an update rather than a conflict
  - Changing cross-device ordering; `deviceId` precedence is preserved
  - Backfilling historical rows with a reconstructed sequence
  - Server-side double-tap dedupe
  - Any auth, RLS, UI, release, tag, or deploy action

- **Dependencies**: `StoredMutation.seq` (already present, #62) and the outbox's serialized append. Both
  exist; nothing is blocked on outside work.
- **Risk**: `A missed copy site would persist client_seq as 0 forever and the comparison would never see a real sequence. Mitigated by asserting the round trip through real storage.`
- **Verification Condition**: `compareEntityVersions orders a same-device same-millisecond pair by clientSeq in both argument directions, deviceId still wins across devices, a pair of unknown sequences still falls through to mutationId, a request without clientSeq still parses, and the full unit and API suites stay green.`

## 3. Acceptance Criteria

- [x] **AC-1**: Same device, same `effectiveTs`, higher `clientSeq` wins.
  - **Result**: PASS
  - **Evidence**: `tests/unit/domain/sync-engine.test.ts:156` - one device, one `effectiveTs`, `clientSeq` 2 against 1. The losing side deliberately carries the higher mutation id (`99999999-9999-4999-8999-999999999999` against `11111111-1111-4111-8111-111111111111`), so the pre-change order would have returned negative; only the sequence can produce the expected positive result.
- [x] **AC-2**: The comparison is antisymmetric for that pair.
  - **Result**: PASS
  - **Evidence**: The same case with the arguments reversed returns negative in the same test, and `tests/unit/domain/sync-engine.test.ts:166` checks both directions again across devices.
- [x] **AC-3**: `clientSeq` never overrides `deviceId`.
  - **Result**: PASS
  - **Evidence**: `tests/unit/domain/sync-engine.test.ts:166` - device A with `clientSeq` 9 against device B with `clientSeq` 1 returns negative. A larger counter cannot cross a device boundary, which is why the sequence is compared after the device and not before it.
- [x] **AC-4**: Two unknown sequences still fall through to `mutationId`, matching the pre-change result.
  - **Result**: PASS
  - **Evidence**: `tests/unit/domain/sync-engine.test.ts:176` - both sequences 0 with different mutation ids orders by the id, and a version compared with its own copy returns 0. That is the pre-change answer exactly, so a row backfilled to 0 keeps the verdict it had.
- [x] **AC-5**: A request without `clientSeq` still parses, and one with it parses too.
  - **Result**: PASS
  - **Evidence**: `tests/unit/contracts/contracts.test.ts:132` parses a batch with no `clientSeq`, with 7, and with 0, and rejects -1 and 1.5. `tests/integration/api/sync.test.ts:333` posts a four-mutation batch queued by the previous build with no `clientSeq` and receives 200 with the narrowed wire shape, so the compatibility is proved through the route and not only through the schema.
- [x] **AC-6**: The sequence round-trips to storage.
  - **Result**: PASS
  - **Evidence**: `tests/integration/repository/workout-repository.test.ts:704` reads `client_seq` = 4 straight out of `sync_entity_versions` after `applySync`. It reads the table rather than a getter because a getter would pass even if the write path dropped the field, which is risk R1 exactly.
- [x] **AC-7**: The migration is additive and contiguous.
  - **Result**: PASS
  - **Evidence**: `tests/unit/migration-authority.test.ts` green in the same run. `supabase/migrations/0009_sync_entity_client_seq.sql` is the tenth contiguous hand-authored migration: one `ADD COLUMN IF NOT EXISTS` with a default and one named check, no rewrite and no data statement.
- [x] **AC-8**: The client sends the stored `seq`.
  - **Result**: PASS
  - **Evidence**: `tests/unit/state/sync-engine.test.ts:466` asserts the recorded send carries `clientSeq` `[0, 1]`. Because the field is optional on the wire, nothing else forces it there: without the mapping both taps travel `undefined`, both read 0 on the server, and the pair falls back to the random mutation id, which is the defect restored by omission.
- [x] **AC-9**: Existing suites unchanged: `npm test` 70 files / 695 pre-existing tests, `npm run test:api` 14 files / 84 tests.
  - **Result**: PASS
  - **Evidence**: `npm test` exits 0 with `Test Files 70 passed (70)` and `Tests 703 passed (703)` in 71.34 s - the same 70 files and the same 695 pre-existing cases plus the 8 this task adds. `npm run test:api` exits 0 with `Test Files 14 passed (14)` and `Tests 84 passed (84)` in 124.06 s, the recorded baseline exactly. Neither lane skipped a case.
- [x] **AC-10**: Governance gates unchanged: references exit 0, execution-control `VALID`, setup-assert `OK`, doctor's single accepted red, ci-triage `ERRORS=60|RECORDS=3`.
  - **Result**: PASS
  - **Evidence**: Measured on the tree that carries this record: `validate-references.sh --strict` exit 0, `validate-execution-control.sh --root .` `VALID|RECORDS=11`, `check-setup-assert.sh` `ASSERT|submodule|status|OK`, `check-doctor.sh` with version `STALE(+9)` the only non-OK row, `validate-ci-triage.sh` `ERRORS=60|RECORDS=3`, `npm run typecheck` exit 0.

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `enabled`
- **Batch Authorization**: `S0 through S10 may run in one batch once this record exists. Any step that would touch auth, RLS, a public response shape, or a second component stops the batch.`
- **Authorization Checkpoint Reference**: `Owner authorization of issue #78 option 1 with the Level 2 ceremony, given 2026-11-25 before this record.`
- **Soft Checkpoint**: `After S3 - the contract, migration and schema agree, and the migration-authority test is green.`
- **Hard Checkpoint**: `After S8 - the proof exists and the full unit suite is green, before any state-file edit.`
- **Event-Driven Checkpoints**: `Stop if a second table needs the column, if the contract change cannot stay optional, or if any gate regresses from its recorded baseline.`
- **Stop Conditions**: `A red gate that was green at a389881; a required (non-optional) wire field; an existing row whose verdict changes; a request from the change that falls outside section 2.`
- **Host Timer Capability**: `The host cannot mechanically enforce checkpoints or terminate the session; timing is recorded, never enforced.`

## 5. State and Active Ownership

- **Execution State**: `completed`
- **Mapped `pk:tasks` Status**: `Done`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-11-25 13:45 UTC`
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: `None - this task is closed. The remaining human step is reading the pushed commit and, separately, deciding the disposition of the pre-existing untracked review report.`
- **Branch / Revision**: `main @ a38988124fc04f143c2213cf615c04277ce1f287 (this record lands in the commit that follows it)`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
| --- | --- | --- | --- | --- | --- |
| None | planned | 2026-11-25 13:45 UTC | Agent (DeepSeek Harness / lead) | Planning Record written and this record opened for the authorized Level 2 route | `docs/specs/2026-11-25-spec-sync-client-seq-ordering.md` |
| planned | in_progress | 2026-11-25 13:50 UTC | Agent (DeepSeek Harness / lead) | S1 opened; contract, migration, schema, domain type, repository and client edits applied | `lib/contracts/sync.ts`, `supabase/migrations/0009_sync_entity_client_seq.sql` |
| in_progress | completed | 2026-11-25 14:20 UTC | Agent (DeepSeek Harness / lead) | Eight tests green, both lanes green, every gate at or better than its baseline, state file updated | `tests/unit/domain/sync-engine.test.ts:156` |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `lib/contracts/sync.ts` - optional `clientSeq` on the mutation identity shape
  - `lib/domain/sync/sync-engine.ts` - comparison order, candidate and upsert construction
  - `lib/domain/sync/types.ts` - `SyncEntityVersion.clientSeq`
  - `lib/repositories/workout-repository.ts` - mapping, fallbacks, upsert, flush set list
  - `db/schema/index.ts` - column and named check
  - `supabase/migrations/0009_sync_entity_client_seq.sql` - additive migration
  - `src/app/state/sync-engine.ts` - re-attach the stored sequence
  - `tests/unit/domain/sync-engine.test.ts` - ordering proof
  - `tests/unit/contracts/contracts.test.ts` - optional-field compatibility
  - `tests/integration/repository/workout-repository.test.ts` - storage round trip
  - `docs/STATE.md` - finding closed, last-updated head
  - `docs/specs/2026-11-25-spec-sync-client-seq-ordering.md` - Planning Record
  - `docs/tasks/2026-11-25-sync-client-seq-ordering.md` - this record
- **Scope Change Records**: `None - no scope change was requested, and every changed file was listed in section 2 before the first edit.`
- **Checkpoint Records**: `Soft checkpoint after S3 reached 2026-11-25 14:00 UTC: contract, migration, schema and domain type agree, and `tests/unit/migration-authority.test.ts` is green. Hard checkpoint after S8 reached 2026-11-25 14:05 UTC: the eight ordering tests are green and the state file had not been touched.`
- **Handoff Records**: `None - the task ran in one session.`
- **Verification Evidence**: `Measured on the tree that carries this record. `npm run typecheck` exit 0. `npm test` exit 0: Test Files 70 passed (70), Tests 703 passed (703), 71.34 s. `npm run test:api` exit 0: Test Files 14 passed (14), Tests 84 passed (84), 124.06 s. Targeted lanes: `tests/unit/state/sync-engine.test.ts` 25 passed; `tests/integration/repository/workout-repository.test.ts -t 'stores the client sequence'` 1 passed, 25 skipped; `tests/unit/migration-authority.test.ts tests/unit/contracts/contracts.test.ts tests/unit/domain/sync-engine.test.ts` 43 passed. The local database carries the migration: `npx supabase migration up` applied `0009_sync_entity_client_seq.sql` and `public.sync_entity_versions.client_seq` reads `integer not null default 0`. No file was weakened and no case was skipped to obtain any of these readings.`
- **Behavior IDs [Required when enabled]**: `Not enabled for this record; the behavior registry is off in PROMPTKIT.md, so no behavior identifier is claimed.`
- **TDD Intent Register [Required when enabled]**: `Intent: the tie case in compareEntityVersions is exercised red before the ordering change and green after. Each acceptance criterion above maps to one test in S8.`
- **TDD Execution Evidence [Required when enabled]**: `Partial, and recorded as partial. No red run exists: S1 through S7 changed the comparison before any test could observe the tie, so the discipline this record promised was not executed in order. What is offered instead is evidence the old code could not have produced - the AC-1 pair carries the losing side as the higher mutation id and the winning side as the lower one, so the pre-change order returns negative and only the sequence can return positive - plus the eight tests themselves, each of which fails if its half of the change is reverted.`
- **TDD Exception Verification [Required for Documentation, Configuration, or Research Work; Not applicable for Code Work]**: `Not applicable - this is Code Work, so the exception path does not apply.`
- **CI Evidence**: `Governance workflow on the pushed commit, which runs exactly three validators against the committed tree: validate-references.sh --strict, validate-execution-control.sh --root ., and check-setup-assert.sh . .promptkit . .promptkit. Run id and conclusion are reported to the owner after the push; check-doctor.sh is deliberately not a workflow step, so its version row stays the one accepted red.`
- **Review Evidence**: `Self-review of the full diff before staging, by the actor named above. Checked and found clean: the six files that construct or copy a version all carry clientSeq (six sites in `lib/repositories/workout-repository.ts` alone, counted by grep, because the four required sites are not all of them); no path makes the wire field required; the migration is additive with no data statement; `git diff` adds no file outside section 2; the pre-existing untracked review report was left untouched and unstaged.`
- **Commit Evidence**: `One commit on main with subject `fix(sync): order a same-millisecond pair by the client's outbox sequence` and the four-line Constraint / Confidence / Scope-risk / Not-tested trailer. Recorded in a later commit than the one it names, since this record travels inside it.`
- **Pull Request Evidence**: `N/A - this change lands directly on main under the owner's authorization; no PR is opened, human-confirmed.`
- **Release Evidence**: `N/A - no tag, release, or deploy in scope.`
- **Blocker and Resume Condition**: `None - execution is complete. Nothing here is waiting on a human except the push confirmation and the separate disposition of the untracked review report, neither of which blocks this task's work.`

## 7. Completion Gate

- **Completion State**: `completed`
- **Acceptance Results**: `AC-1 through AC-10 PASS, each with the test or command that produced it recorded beside it in section 3.`
- **Changed-File Summary**: `Fourteen files: six library and client sources (`lib/contracts/sync.ts`, `lib/domain/sync/sync-engine.ts`, `lib/domain/sync/types.ts`, `lib/repositories/workout-repository.ts`, `db/schema/index.ts`, `src/app/state/sync-engine.ts`), one new migration (`supabase/migrations/0009_sync_entity_client_seq.sql`), four test files (`tests/unit/domain/sync-engine.test.ts`, `tests/unit/state/sync-engine.test.ts`, `tests/unit/contracts/contracts.test.ts`, `tests/integration/repository/workout-repository.test.ts`), and this task's two documents plus the state file (`docs/specs/2026-11-25-spec-sync-client-seq-ordering.md`, `docs/tasks/2026-11-25-sync-client-seq-ordering.md`, `docs/STATE.md`). Counted from `git diff --stat` at staging time.`
- **Completion Exception**: `One, recorded rather than hidden: the TDD order in section 4 was not executed as written. The comparison changed before the tests existed, so no failing observation was captured. The gap and its substitute evidence are in the TDD Execution Evidence above. Everything else in section 4 was followed.`
- **Completion Decision and Timestamp**: `Owner authorization of issue #78 option 1 as a Level 2 task, completion recorded by Agent (DeepSeek Harness / lead) - 2026-11-25 14:20 UTC`

A task may be marked `completed` only after acceptance results, verification evidence, changed-file summary, and required commit evidence are linked. This record authorizes nothing beyond the Approval Boundary in section 1.
