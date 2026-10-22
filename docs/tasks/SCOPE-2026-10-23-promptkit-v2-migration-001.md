# Scope Change Record: Add the §3A execution-control projection

<a id="SCOPE-2026-10-23-promptkit-v2-migration-001"></a>

## 1. Identity and Approval Boundary

- **Record Type**: `Scope Change Record`
- **Scope Change ID**: `SCOPE-2026-10-23-promptkit-v2-migration-001`
- **Task ID**: `TASK-2026-10-23-promptkit-v2-migration`
- **Specification**: `docs/specs/2026-10-23-spec-promptkit-v2-migration.md`
- **Proposer / Actor**: `Agent (Codebuff/Buffy)`
- **Created**: `2026-10-22 23:19 UTC`
- **Approval Boundary**: `Owner requested the projection in-session; no remote, release, tag, or deployment action.`

## 2. Proposed Change

- **Reason or Discovery**: `docs-drift cannot compare the canonical Task Record while docs/STATE.md has no §3A projection; the doctor reports SKIP(no execution-control projection).`
- **Current Task Value**: `The Task Record excludes a §3A projection from its explicit non-goals and records no scope change.`
- **Proposed Value**: `Add a synchronized §3A projection in docs/STATE.md sourced from the Task Record, and remove §3A from the Task Record's explicit non-goals.`
- **Affected Objective**: `No change to the migration objective; the projection makes the existing execution-control record observable to docs-drift.`
- **Affected Files or Artifacts**: `docs/STATE.md; docs/tasks/2026-10-23-promptkit-v2-migration.md; docs/tasks/SCOPE-2026-10-23-promptkit-v2-migration-001.md`
- **Affected Acceptance Criteria**: `AC-5 (doctor docs-drift); AC-6 (execution-control record count)`
- **Affected Dependencies**: `None`
- **New or Changed Non-Goals**: `The intake record remains excluded; the §3A projection is no longer excluded and is added as a synchronized projection, not a new authority.`
- **Risk / Estimate Impact**: `Low - documentation projection only; the Task Record remains canonical and the projection is reversible with git.`
- **Changed Verification Condition**: `check-doctor.sh reports docs-drift OK; validate-execution-control.sh exits 0.`

## 3. Impact and Disposition

- **Disposition**: `Scope expansion`
- **Independent Work Discovered**: `None`
- **Required Human Confirmation**: `Not required - the owner requested the change directly in this session`
- **Required New Task Record**: `N/A`
- **Block Until Resolved**: `No`

## 4. Approval and Evidence

- **Decision**: `Approved`
- **Approver**: `Owner`
- **Decision Timestamp**: `2026-10-22 23:19 UTC`
- **Approval Evidence**: `Owner instruction in the active session: "Populate docs/STATE.md §3A from the migration Task Record so docs-drift can run" (2026-10-23 local).`
- **Related Checkpoint**: `None`
- **Related Handoff**: `None`
- **Branch / Revision**: `chore/promptkit-v2-sync @ 70e8fba`
- **Verification Plan or Result**: `Run check-doctor.sh; expect docs-drift OK. Run validate-execution-control.sh; expect VALID, RECORDS=2.`
- **Blocker and Resume Condition**: `None`

## 5. Resolution

- **Previous Task State**: `awaiting_review`
- **Resulting Task State**: `awaiting_review`
- **Task Record Updated**: `docs/tasks/2026-10-23-promptkit-v2-migration.md (updated 2026-10-23)`
- **New Task / Exception Links**: `None`
- **Changed Scope Summary**: `§3A projection added; Task Record remains canonical; the intake record remains excluded.`
- **Next Action**: `Commit the §3A projection and this scope change record, then rerun doctor and validator.`
- **Recorded By and Timestamp**: `Agent (Codebuff/Buffy), 2026-10-22 23:19 UTC`
