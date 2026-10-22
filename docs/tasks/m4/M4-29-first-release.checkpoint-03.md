# Checkpoint 03 — `v1.0.0` release: the release is code-complete, production is provisioned, and CI is blocked on the account's Actions allowance

**Task ID**: `TASK-m4-29-first-release-checkpoint-03` · **State**: `handoff_ready`
**Identity chain**: M4-29 (release) → M4-30 (#173, health) → M4-31 (#174, startup env) → M4-32 (#175, seed) →
M4-34 (#177, Vercel env) → M4-35 (#178, hosting decision) · **Predecessor**: `M4-29-first-release.checkpoint-02.md`

## Phase 1 — Workspace delta audit (executed this turn, not recalled)

| Check | Value |
| :--- | :--- |
| `main` @ | **`532c1c9`** — `0 behind / 0 ahead` of `origin/main`, working tree **clean** |
| Tag | **0** — `v1.0.0` deliberately uncreated |
| Engine gitlink | `.promptkit` @ `2340251` (`v1.8.0-15-g2340251`), clean |
| `.env.local` | **2,438 bytes** — 1,623 baseline **+ the 7 `HOSTED_*` keys added during hosted provisioning**; still ignored (`.gitignore:18`), no `VERCEL_OIDC_TOKEN` regression |
| CLI footprint | `.vercel/` absent, throwaway env-pull file absent |
| Debug probes | `0` in `src/` and `lib/` |
| Milestone #4 | **open 13 / closed 29** (42 total, 69%) |
| Newest CI run | `35563333673` on `6203057` — `failure`, job `test`, `steps: 0` |

## Phase 2 — State synthesis

**Objective**: ship `v1.0.0` as a *verifiable* release. Verifiability, in this repo, means a CI run on the
release revision and a publicly reachable production surface. **Neither exists**, for independent reasons.

**Completed since checkpoint-02**

1. **Hosting decision made and executed.** The owner chose to stay on Supabase rather than migrate to Neon
   (decided on measured coupling: 56 RLS policies, 98 `auth.uid()` references, a trigger on `auth.users`,
   GoTrue magic-link as the only sign-in path). `shelf` was paused to free a free-plan slot; the hosted
   project **`ppl-fitness-tracker`** (`kkzzwzzkysyvvzgifymk`, ap-southeast-2) was created, **9 migrations
   applied** (13 public tables, 52 RLS policies), the migration-0001 `PASSWORD` literal **rotated**, and the
   seeds applied.
2. **B5 CLOSED — PASS.** 18 strength / 13 stretch exercises, 31 distinct slugs, 3 routine days, 33
   routine exercises — read under **both** the owner role and the RLS-bound app role, identical. The
   app-role read is the substantive half: system content is readable through RLS without a session.
3. **B6 CONFIGURED.** Four Production variables on Vercel plus a redeploy (`pvkrp0ea8`). Boot proven by an
   **equivalent local test** against the hosted database (`/api/health` → 200, db 36.3 ms) — explicitly not
   the card's production probe, which B1 still blocks, so **#177 stays open on purpose**.
4. **B7 resolved**; #175 and #178 **closed**.
5. **CI triage completed and extended.** `main`'s red is the GitHub account, not code: five runs, two
   revisions, `steps: 0` in ~2 s, one verbatim annotation. The triage record documents that **neither a
   re-run nor a push can arbitrate** while the condition holds.
6. **Local gate executed** on `89418d5` as the only arbitration available — lint 0 · typecheck 0 ·
   `set_config` ban 0 · preflight 4/4 · **638 unit/integration** · **84 API** · **81 e2e, 0 skipped**, against
   a production build, every M3 SLA inside budget. Record: `gate-local-89418d5.md`.
7. **Free CI cost fix landed** (`34cd1c8`) with its measurement record (`ci-cost-measurement.md`):
   `paths-ignore` for docs-only pushes + PR-only `concurrency`. Measured saving **~33%** (~759 of 2,279
   runner-minutes), **not** the 38% the two buckets sum to — 96 minutes were both.

**The cost fix is now behaviourally proven, not merely parser-accepted.** Pushing `532c1c9` (files:
`docs/STATE.md` + `docs/releases/ci-triage/CI-github-35555062183.md` — all docs) produced
**`total_count = 0`** runs for that SHA: GitHub skipped it. The preceding push (`6203057`, which touched
`.github/workflows/test.yml`) did create a run. One push skipped, one ran — that is the filter working.

### A correction carried in this record

The turn that pushed `532c1c9` claimed *"a sixth occurrence — job `test`, `steps: 0`"*. **That was wrong.**
`gh run list --limit 1` returned run `35563333673`, which belongs to the **previous** push (`6203057`);
the new push had created no run because `paths-ignore` skipped it. The claim came from reading a run's
result without checking its **head SHA** — the same identifier-not-verified pattern that earlier produced a
phantom `M4-36` card reference and a mistyped project ref. **The occurrence count is five**, and no record
was polluted (the sixth was never written), but the chat claim was false and is corrected here.

**Remaining / not started**

- **B1 (#176)** — Vercel Deployment Protection. Still the gate on the release's public face.
- **B2 (#16)** — sign-in blocker.
- **The tag** — held. `main`'s last CI-verified-green revision is `e11e75b`; everything after it is
  **locally** verified only.
- **CI allowance** — owner-only; see below.

**Blockers, with owners**

| Blocker | Owner | Resolution condition |
| :--- | :--- | :--- |
| GitHub Actions allowance exhausted (5 measured occurrences) | **Owner** | The allowance resets at the start of the billing cycle, **or** the plan/meter is read (`user` scope) and the true allowance established. **No payment method, no budget, nothing subscribed** — that constraint is the owner's and it is a hard one |
| Possible silent consumer: **Copilot code review** (billed as Actions minutes on private repos since 1 Jun 2026) | Owner | Check the setting; disabling it is free |
| **B1 / #176** Deployment Protection | Owner | Lift it, or record the release as non-public |

## Locked technical invariants (do not undo)

1. No secret value appears in any issue, comment, document, or commit — `.env.local` and Vercel only.
2. `● Ready` is a **build** result, never a runtime one.
3. Measured and inferred are labelled separately, always.
4. The `v1.0.0` tag stays uncreated while the candidate has no CI result and production cannot boot.
5. Do **not** re-run or bisect the red CI — every attempt measures the account, not the code. A **push**
   cannot arbitrate either (measured twice).
6. Closing keywords belong in PR bodies only.
7. A card's verification command is a hypothesis until executed.
8. **No spend**: no payment method, no budget, no subscription, no plan change. Any proposal requiring
   payment is declined by default.
9. **Local evidence is never CI arbitration** — it must be labelled as local, with its venue (workstation,
   local stack) stated wherever it is cited.
10. **Verify an identifier before attributing data to it** — read a run's `head_sha`, a card's number, and a
    project's ref from the source, never from sequence or from "the newest thing".
11. Never modify, weaken, or delete a test to force a green result.

## Exactly one next action

**Ask the owner to read `github.com/settings/billing` (plan name + "X of N included minutes used") and the
Actions/Copilot settings, then set nothing that costs money.** That is the only action that can unblock CI
without spend, and every other path is blocked on it. Until then, `pk:checkpoint`'s rule applies: read-only
diagnosis may continue; nothing may be implemented, committed, or pushed that changes project state.

## Receiver validation checklist

- [ ] `git rev-parse --short HEAD` reads **`532c1c9`**, tree clean, `tags: 0`
- [ ] `git rev-list --left-right --count origin/main...HEAD` reads **`0 0`**
- [ ] `gh api "/repos/:owner/:repo/actions/runs?head_sha=$(git rev-parse 532c1c9)"` reads **`total_count=0`** — the cost fix working
- [ ] The newest run is **`35563333673` on `6203057`** — **five** occurrences, not six
- [ ] `docs/releases/ci-triage/gate-local-89418d5.md` exists and is labelled local-only
- [ ] No payment, budget, subscription or plan change has been made
- [ ] The tag list is empty and stays empty until a green run exists

---

### Handover Prompt for Fresh Chat Session

```markdown
# Session Resume: ppl-fitness-tracker v1.0.0 — everything is done except what only you can do

## 1. Context & Environment
- **Branch**: `main` at `532c1c9` — clean tree, **0 ahead / 0 behind** `origin/main`
- **Active Task**: ship `v1.0.0` as a *verifiable* release
- **Current Status**: code and docs complete and locally green; production is provisioned and boots;
  **CI cannot start** (GitHub Actions allowance), and the public surface is still behind SSO

## 2. Key Files to Inspect
- `docs/tasks/m4/M4-29-first-release.checkpoint-03.md`: this record — read first
- `docs/releases/ci-triage/CI-github-35555062183.md`: why CI is red (5 occurrences; the account)
- `docs/releases/ci-triage/ci-cost-measurement.md`: the minute accounting behind the free fix
- `docs/releases/ci-triage/gate-local-89418d5.md`: the local gate, labelled local-only
- `docs/releases/2026-09-21-v1.0.0-release-readiness.md`: blockers B1–B2, env audit, corrections
- `.github/workflows/test.yml`: the cost fix, and the comment explaining what it deliberately declines

## 3. Locked Technical Invariants (Do Not Undo)
- **No spend.** No payment method, no budget, no subscription, no plan change — owner's hard constraint.
- Local evidence is never CI arbitration; label it as local with its venue.
- `● Ready` is a build result, never a runtime result. Measured and inferred stay separate.
- The `v1.0.0` tag stays uncreated until a green run exists. Do not re-run or bisect the red.
- Verify identifiers (run `head_sha`, card number, project ref) from the source before attributing data.
- No secret value ever enters a document, issue, comment, or commit.

## 4. Current State & Immediate Next Step
- **Done**: hosted Supabase provisioned (9 migrations, 52 RLS policies, seeds), B5/B6/B7 resolved,
  local gate green (638 + 84 + 81 tests), free CI cost fix landed and behaviourally proven
- **Next immediate action**: the owner reads `github.com/settings/billing` (plan + minutes used) and the
  Copilot code-review setting, and reports back — **spending nothing**. Until that answer arrives, no
  implementation, commit, or push should change project state.

## 5. Optional Release-Evaluation Handoff
- **Evaluation ID**: N/A
- **Release Candidate Commit**: `532c1c9` (tree content; **no tag exists**)
- **Preliminary SemVer Candidate**: `v1.0.0` with status `preliminary`, **not approved**
- **QA Status**: local gate GREEN on `89418d5` (638 unit/integration, 84 API, 81 e2e, 0 skipped) — **not**
  CI arbitration; no runner has executed a step since `e11e75b`
- **Unresolved Blockers**: GitHub Actions allowance (owner-only, free-by-reset); B1/#176 Deployment
  Protection (owner); possible Copilot code-review minute drain (owner)
- **Requested Release Coordinator Decision**: resolve the allowance or accept a documented non-public
  preview, then decide whether `v1.0.0` ships on local-only evidence
- **Source Evaluation / Task Record**: `docs/tasks/m4/M4-29-first-release.checkpoint-03.md`
- **Handoff Boundary**: projection only. No tag, release, publication, deployment, or rollback is
  authorized by this record. Final approval belongs to `pk:ship` and the Release Coordinator.
```
