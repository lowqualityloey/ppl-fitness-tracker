# CI cost measurement, and the free fix it justifies

**Date**: 2026-09-21 · **Measures**: `lowqualityloey/ppl-fitness-tracker`, all 227 runs the repo has ever created

## Why this exists

CI stopped starting. Four runs across two revisions, every one `steps: 0` inside ~2 s, on
GitHub's account-billing annotation (`CI-github-35555062183.md`). The account condition is an owner
action; **this record is about the half that is ours** — how many minutes the workflow consumes and
how much of that is waste.

No plan was changed and nothing was purchased. The owner's constraint was explicit: **fix it for
free or not at all.**

## How it was measured

| Step | Source |
| :--- | :--- |
| Which runs exist | `GET /repos/{owner}/{repo}/actions/runs` — 3 pages, **227 runs**, created `2026-09-07T23:31Z` → `2026-09-21T04:26Z` |
| Duration per run | `GET /repos/{owner}/{repo}/actions/runs/{id}/timing` → `run_duration_ms` |
| "Docs-only" classification | local `git diff --name-only <previous-run-sha-on-branch> <sha>` — the *push's* file set, not the tip commit's, so a docs commit at the tip of a code PR is not misclassified |
| "Superseded" classification | sorted per branch by start time; run *i* is superseded when the next run on the same branch started before *i* finished |
| Environment ruled out | artifacts `total_count = 0`; cache `1,340,024,528 B` (~1.25 GiB) of a 10 GB/repo allowance |

**The billing meter itself was not readable.** `GET /users/{login}/settings/billing/actions` returns
`404` without the `user` token scope, which this workstation's `gh` login does not have
(`gist`, `project`, `read:org`, `repo`, `workflow`). An authorized scope refresh was offered and did
not complete, so **`included_minutes` and `total_minutes_used` remain `not measured`** — which is why
the plan question (Free's 2,000 vs student Pro's 3,000) is still open, and why everything below is
labelled as wall-clock rather than billed minutes.

## What the 227 runs cost

| Bucket | Runs | Runner wall-clock | Recoverable |
| :--- | ---: | ---: | :--- |
| **Total** | **227** | **2,279 min** | — |
| Docs-only pushes | 64 | 700 min | ✅ `paths-ignore` |
| Superseded by a newer run on the same ref | 28 | 266 min | ✅ `concurrency` |
| Real code pushes | 76 | 712 min | no — this is the gate earning its keep |
| First run on a branch (no prior run to diff against → `unknown`) | 87 | 868 min | no |

## The fix, and why it is 33% rather than 38%

Two changes in `.github/workflows/test.yml`:

1. **`paths-ignore: ['docs/**', '**/*.md']`** on both events → drops the 700 min bucket.
2. **`concurrency`**, `group: ${{ github.workflow }}-${{ github.ref }}` → cancels superseded runs.

**The two buckets overlap: 96 of the 266 superseded minutes were also docs-only**, and a run that is
skipped never exists to be cancelled. The honest figures:

| Configuration | Saving | Of 2,279 |
| :--- | ---: | ---: |
| As implemented — `cancel-in-progress` **PR-only** | **~759 min** | **33%** |
| If `main` also cancelled | ~870 min | 38% |

**`cancel-in-progress` is PR-only on purpose.** Cancelling on `main` would have reclaimed another
**110 min**, and the measurement says every one of those runs was a **code** revision (12 runs /
110 min code vs 8 runs / 87 min docs-only). Cancelling a code run means that revision ends
`cancelled` rather than arbitrated, which breaks the property that every code revision on `main` has
a CI result — and `docs/STATE.md` cites `main`'s last CI-green revision by SHA. Reclaiming those
minutes is `cancel-in-progress: true`, one line, deliberately declined and reversible.

`main` carries **no branch protection** (`GET /repos/{owner}/{repo}/branches/main/protection` →
*"Branch not protected"*; `GET .../rulesets` → `[]`), which is what makes `paths-ignore` safe on the
`pull_request` event: a path-skipped workflow cannot strand a PR on a required check that never
reports. **If a ruleset is ever added to `main`, this must be revisited.** No test or script reads
anything under `docs/` at runtime — every `docs/` reference in `tests/` is a provenance comment — so
the ignore list does not silently unverify anything.

## Caveats, stated rather than buried

- **Wall-clock is a proxy.** GitHub bills elapsed time per job, rounded **up to the minute per job**.
  With one `test` job per run the proxy is close, and it is an **under**-estimate for rounding — an
  upper bound of roughly 2,400 min is the fairer number.
- **Cancelling refunds nothing.** Minutes already spent are billed. Each superseded figure is the
  *remainder* the cancellation avoids, not a whole run.
- **875 runs' worth of classification is inference.** "Docs-only" comes from the diff range; the 87
  `unknown` runs are first-runs-on-a-branch, counted as code, so the 700 min figure is not inflated
  by them.
- **The window is a sprint.** 227 runs in 14 days is not a steady-state month, so the *percentages*
  are the durable claim and a monthly projection would not be.

## Still free, still open

- **Student Pro entitlement** — 3,000 min vs Free's 2,000. Unverified either way (`user` scope).
- **Copilot code review** — consumes Actions minutes on private repos since 1 Jun 2026; a drain that
  never appears in the run list above. Free to disable.
- **The cycle reset** — free minutes reset in full at the start of each billing cycle; the reset date
  is owner-only knowledge.

**Explicitly excluded from consideration**: adding a payment method or budget (spending, forbidden by
the owner), making the repo public (would publish a committed `PASSWORD` literal in
`supabase/migrations/0001`), and self-hosted runners (billed at $0.002/min on private repos since
1 Mar 2026 — also spending).

---

## Step-level timings: the API suite, 2026-10-23

The section above prices *policy* levers — when a run exists at all. This section prices one
**step**, for `TASK-ci-runtime-reduction` and `TASK-api-suite-shared-server`.

### What CI measured before the change

From `gh run view <id> --json jobs` on the two lanes, before 2026-10-23:

| Step | PR run | `main` run |
| :--- | ---: | ---: |
| Run API route-handler suites | **249 s** | **208 s** |

The step ran 14 test files, and **each file booted its own `next dev`** because
`fileParallelism: false` runs files serially and the child lived in module scope.

### What the suite costs locally, measured on one revision

**Correction (2026-11-19, review finding F4).** This section used to label the 259 s column
"before" and derive "~156–169 s saved" from it. That label was wrong, and the saving it produced
compared two configurations of the **new** code, not the code that was there before the change.

Both columns below were measured on the same revision (`560ebde` plus the harness change), same
database, same machine. The 259 s column is that revision's **own fallback path** —
`startApiServer()` spawning one server per file when no shared manifest exists
(`tests/integration/api/test-server.ts:181-193`) — not the pre-change harness.

| Measurement | Fallback path, one server per file | Shared server |
| :--- | ---: | ---: |
| Wall clock, warm `.next` | **259 s** | **103 s / 91 s / 90 s** (three consecutive runs) |
| Wall clock, cold `.next`, file order shuffled | not measured | **100 s** |
| `next dev` boots | **14** (14 log files, 14 `Ready in` lines) | **1** |
| Files / tests | 14 / 84, 0 skipped | 14 / 84, 0 skipped |

The 259 s → 90–103 s difference is real and it is the harness's own switch, but it measures
**one boot vs fourteen** within the new code. It is a valid A/B of the mechanism. It is not a
before/after of the change, and the phrase "~156–169 s saved per run" was withdrawn for that
reason: the pre-change harness at `560ebde` wrote its child's output to **pipes**, not to a log
file (`stdio: ['ignore', 'pipe', 'pipe']`), so its wall clock was never measured with the same
instrument and cannot be subtracted from anything here.

**Pre-change harness wall clock: `not measured`.** The only honest before/after pair available is
the CI one in the table above (249 s PR / 208 s `main`), which is a different instrument on a
different machine, and the post-merge number it would be compared against does not exist yet.

Boot cost alone was measured at 16.65 s cold and 9.47 s warm per server; the per-boot route
recompilation is what the rest of the difference buys.

**These are local numbers, not CI numbers.** CI's step is slower end to end (208–249 s), so the
projection in the spec — 70–110 s — is the band to check against a post-merge run, not the local
figures. The local pair is a controlled comparison of boot count — both columns share the revision,
the database, the machine, and every test — but it is a comparison of two ways to run the *new*
harness, not of the harness against its predecessor. Only the post-merge CI step can answer that,
and it is `not measured` until it runs.

### One observed flake mode, and its cure

During this work a run failed with the readiness probe answering **500**, the log naming
`Can't resolve '@vercel/turbopack-next/internal/font/google/font'`. The cause was a `.next` font
cache left half-written by a `next dev` that had been SIGKILLed mid-compile during port experiments,
not the harness: `rm -rf .next` and the next run was green in 100 s, cold. CI never sees this — it
has no persisted `.next` — but a workstation can, and the cure is the cache reset rather than a
re-run.
