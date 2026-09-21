<a id="TASK-m4-29-first-release"></a>

# Task Record: M4-29 — first production release (v1.0.0 readiness and release process)

> **Developer-friendly fill-in guide:** **Required** fields must contain a concrete value before the
> record can move forward. `N/A` is used only where the field's own rule permits it.

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-m4-29-first-release`
- **PromptKit Adaptation Profile**: `none`
- **Work Type**: `Configuration Work` (release engineering + documentation; no application code is
  written by this task — see Explicit Non-Goals)
- **Planning Record Link**: `N/A`
- **Planning Depth Reference**: `Full` (`pk:ship`, Level 3)
- **Assumption Record Links**: `None`
- **Specification**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md` (this task's operative
  record; `docs/specs/2026-09-14-spec-m4-hardening-telemetry-decommission.md` is the governing M4 spec)
- **External Reference**: issue **#16** (production SMTP — a blocker, not this task's deliverable)
- **Owner / Actor**: Owner (lowqualityloey) as Deploy Lead; Agent (Freebuff/Buffy) as author
- **Execution Scope**: repository release artifacts (`docs/releases/`, `docs/tasks/m4/`) and the
  repository's first `v*` tag
- **Approval Boundary**: **tag creation, tag push, hosted release, changelog publication, deployment,
  and rollback are human-only.** This record may propose them; it may not execute them.
- **Created**: `2026-09-21 01:45 UTC`

## 2. Objective and Boundaries

- **Objective**: Record the repository's first release — candidate revision, measured production
  state, blockers, rollback runbook, and the human-only tag decision — so that "has this shipped?"
  stops being answerable only from a chat transcript.
- **In Scope**:
  - The release readiness record at `docs/releases/2026-09-21-v1.0.0-release-readiness.md`
  - An evidence-based audit of the already-existing automatic production pipeline
  - Naming blockers B1–B6 with owners and unblock conditions
  - Preparing (not executing) the `v1.0.0` tag command
- **Explicit Non-Goals**:
  - **Writing application code.** `/api/health` (B3) and startup env validation (B4) are named here
    and each needs its **own** card; bundling them into a release task would hide them from review.
  - Closing **#16** (B2) — owner-blocked, and not closable by an agent.
  - Changing Vercel project settings (B1) — dashboard action, owner-only.
  - Running migrations or seeds against the hosted project (B5) — verification is read-only.
  - Tagging, pushing, deploying, or rolling back — reserved by the Approval Boundary above.
- **Dependencies**: Owner's dashboard access for B1/B5; #16 for B2
- **Risk**: `Medium` — the risk is not that this task breaks production (it changes no code) but that
  **production is already changing without release discipline**; the mitigation is this record plus a
  tag that gives a stable restore point.
- **Verification Condition**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md` exists and every
  factual claim in it traces to a command run in the same session (or is explicitly labelled
  owner-reported); `git tag -l` shows `v1.0.0` **only after** human approval.

## 3. Acceptance Criteria

- [x] **AC-1**: The release record exists, is anchored `RELEASE-v1.0.0`, and carries a linkage state.
  - **Result**: `Pass`
  - **Evidence**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md`, linkage state `blocked`
- [x] **AC-2**: The production pipeline's actual, previously-undocumented state is measured and recorded.
  - **Result**: `Pass`
  - **Evidence**: ≥100 Production deployments since `2026-09-08T02:10:44Z` by `vercel[bot]`; latest
    `e11e75b` `state=success` (`gh api .../deployments`)
- [x] **AC-3**: The production URL's user-facing reachability is measured, not assumed.
  - **Result**: `Pass` (result: **blocked by Vercel Deployment Protection**)
  - **Evidence**: 6 read-only GETs → `HTTP 302` to `vercel.com/sso-api`; recorded as B1
- [x] **AC-4**: Every blocker has an owner and an unblock condition; none is left as prose.
  - **Result**: `Pass`
  - **Evidence**: B1–B6 table in the release record
- [x] **AC-5**: The tag is **proposed** and **not** executed without human approval.
  - **Result**: `Pass` (proposal recorded; no tag created)
  - **Evidence**: Human-Only External-Action Decisions block; `git tag -l` still empty
- [ ] **AC-6**: The release reaches `verified` — smoke probes pass against production.
  - **Result**: `Pending` — cannot pass while B1/B3 stand
  - **Evidence**: §4 probe table

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `N/A - exception work type` (Configuration/Documentation Work)
- **Batch Authorization**: `N/A`
- **Soft Checkpoint**: `~60 minutes` of active release work
- **Hard Checkpoint**: `at or before 90 minutes`
- **Event-Driven Checkpoints**: milestone, task switch, scope expansion, handoff, compaction, drift
- **Stop Conditions**: missing approval, failed verification, unresolved blocker, hard checkpoint, developer stop
- **Host Timer Capability**: `POLICY_LIMITATION` — this host can observe turn counts, not wall-clock
  elapsed time; no mechanical timer enforcement is claimed.

## 5. State and Active Ownership

- **Execution State**: `awaiting_review` — the artifact is written; the tag is the owner's decision
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None` (no execution in flight)
- **Start Time**: `2026-09-21 01:35 UTC`
- **Current Actor**: Agent (Freebuff/Buffy)
- **Next Action**: Owner records a decision on tag creation for `v1.0.0` at `e11e75b`, or declines and
  keeps the release record as a readiness-only document.

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `planned` | `in_progress` | `2026-09-21 01:35 UTC` | Agent (Freebuff/Buffy) | `pk:ship` selected; L3 declared | this session |
| `in_progress` | `awaiting_review` | `2026-09-21 01:45 UTC` | Agent (Freebuff/Buffy) | Readiness record complete; tag needs human approval | release record §Human-Only block |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `docs/releases/2026-09-21-v1.0.0-release-readiness.md` — new; the release record
  - `docs/tasks/m4/M4-29-first-release.md` — new; this record
  - `docs/STATE.md` — §7 item 46 + §8 row recording the discovery and the blocker set
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**: `git tag -l` → empty · `gh api .../deployments` → ≥100 Production ·
  6 read-only curl probes → `302` SSO · route census → no `/api/health` · `grep` → no `src/env.ts` ·
  CI `Test Suite` `completed/success` on `8ae6f8c` and `e11e75b` (15 min each)
- **Behavior IDs**: `N/A - exception work type`
- **TDD Intent Register**: `N/A - exception work type`
- **TDD Execution Evidence**: `N/A - exception work type`
- **TDD Exception Verification**: `N/A - exception work type`; this work produces release documentation
  whose correctness is verified by re-running the evidence commands above
- **CI Evidence**: GitHub Actions `Test Suite` — runs `35550189300` (`8ae6f8c`) and `35550564283` (`e11e75b`), both `completed/success`
- **Review Evidence**: `N/A` — documentation-only; requires owner review before the tag
- **Commit Evidence**: `N/A before commit`
- **Pull Request Evidence**: `N/A` — no code; if the owner wants review, these are docs-only commits on `main`
- **Release Evidence**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md#RELEASE-v1.0.0`
- **Blocker and Resume Condition**: **B1** (Vercel Deployment Protection) and **B3** (`/api/health`)
  block the smoke probes; **B2** (#16 SMTP) blocks authentication; each has an owner and an unblock
  condition in the release record. Resume when the owner either lifts B1+B3 or records a decision to
  release without them.

- **Completion State**: `awaiting_review`
- **Acceptance Results**: `AC-1 Pass; AC-2 Pass; AC-3 Pass; AC-4 Pass; AC-5 Pass; AC-6 Pending`
- **Changed-File Summary**: two new documentation files plus a `STATE.md` continuity update; **no
  source file, schema, migration, or configuration in the deploy path was modified**
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Pending` — awaiting owner decision on the tag
