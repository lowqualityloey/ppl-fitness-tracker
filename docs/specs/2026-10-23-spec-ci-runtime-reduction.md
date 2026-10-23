# Technical Design Document (RFC): CI Runtime Reduction — Both Lanes

- **Author**: Repository owner (heyLoey) with Buffy
- **Status**: Draft — awaiting sign-off
- **Created**: 2026-10-23
- **Target Release**: M4 housekeeping (no milestone assignment yet; `pk:tasks` owns the Task ID)

---

## Planning Record (PromptKit Adaptation)

<a id="PLAN-ci-runtime-reduction"></a>

### Planning Record Metadata

- **Planning Record ID**: `PLAN-ci-runtime-reduction`
- **Planning Depth**: `Full` — `.github/workflows/test.yml` is release configuration, and a bad edit
  here removes the only merge gate the repo has.
- **Owner**: Repository owner (heyLoey)
- **Record Status**: `draft`
- **Local Task Record Link**: `TBD — created by pk:tasks`
- **Workflow Links**: `pk:plan` → this spec → `pk:tasks` → implementation

### Planning Inputs

- **Requested Outcome**: Both CI lanes (`pull_request` = pre-merge, `push` to `main` = post-merge)
  finish in less wall-clock time **without increasing billed runner-minutes**. Remove the waste that
  is provably waste; do not restructure the gate.
- **Observable Completion Condition**: A measured per-step before/after table, from real GitHub runs
  on both lanes, showing a lower job duration and no step materially slower than its baseline.
- **Scope Boundary**: `.github/workflows/test.yml` only, plus the measurement record under
  `docs/releases/ci-triage/`. No test file, no budget, no assertion, no product code, no dependency
  version, no branch-protection change.
- **TDD Enforcement Proposal (Reference Only)**: `disabled` — this is Configuration Work. There is no
  product behavior to drive Red→Green; the verification path is a measured CI run. The canonical
  Task Record owns the actual mode.

### Full Planning

- **Explicit Non-Goals**: see §2.
- **Affected Behavioral Components**: the `test` job in `.github/workflows/test.yml`; its
  Playwright install step, its Supabase lifecycle steps; the PR and `main` lanes that share them.
- **Externally Visible Contracts**: the workflow name `Test Suite` and the job/check name `test` are
  visible in the GitHub UI and in every historical run. `main` has **no protection rules and no
  rulesets** (verified 2026-10-23: `GET /branches/main/protection` → `404 Branch not protected`;
  `GET /rulesets` → `[]`), so no required check currently consumes those names. They are still
  preserved as a locked invariant because adding a ruleset later would silently make them one.
- **Failure or Rollback Considerations**: every change here is a workflow-YAML edit reverted by
  `git revert`; no data, no deployment, no tag. The one non-obvious failure is a broken gate that
  still reports green — addressed in §5 by forbidding `continue-on-error` and by verifying the cache
  path installs on a miss.
- **Verification Approach**: real GitHub runs on both lanes, compared step-by-step against the
  baseline in §3.4, plus the unchanged local gate (`lint`, `typecheck`, `npm test`, `test:api`,
  `test:e2e`) after the edits.

### Assumption Records

<a id="ASSUMPTION-ci-runtime-reduction-001"></a>
#### `ASSUMPTION-ci-runtime-reduction-001`

- **Assumption ID**: `ASSUMPTION-ci-runtime-reduction-001`
- **Unanswered Decision**: How many seconds does excluding six unused Supabase services actually save?
- **Provisional Answer**: 20–60 s of the measured 150–174 s `Start Supabase` step.
- **Impact if Wrong**: If the saving is near zero, the change is still correct (CI stops running a
  stack no suite uses) but does not contribute to the runtime goal; the plan's projected total is
  optimistic by that amount.
- **Validation Action**: Compare the `Start Supabase` step duration on the first post-merge `main`
  run against the 174 s baseline.
- **Decision Owner**: Repository owner (heyLoey)
- **Status**: `open`
- **Supporting Evidence**: `docs/specs/2026-10-23-spec-ci-runtime-reduction.md#baseline`
- **Resolution Evidence**: `N/A - unresolved`

<a id="ASSUMPTION-ci-runtime-reduction-002"></a>
#### `ASSUMPTION-ci-runtime-reduction-002`

- **Assumption ID**: `ASSUMPTION-ci-runtime-reduction-002`
- **Unanswered Decision**: What does the Playwright install step cost on a cache hit?
- **Provisional Answer**: 30–45 s (restore ~400 MB from the Actions cache, then `apt-get` for system
  libraries), versus the measured 152 s and 453 s cold downloads.
- **Impact if Wrong**: A slower hit shrinks the headline saving; it cannot make the step slower than
  a miss, because a miss falls back to today's behaviour.
- **Validation Action**: Read the step duration on the second run that sees the same key.
- **Decision Owner**: Repository owner (heyLoey)
- **Status**: `open`
- **Supporting Evidence**: `docs/specs/2026-10-23-spec-ci-runtime-reduction.md#baseline`
- **Resolution Evidence**: `N/A - unresolved`

### Technology and Vendor Decision Records

<a id="DECISION-ci-runtime-reduction-001"></a>
#### Decision Record: `DECISION-ci-runtime-reduction-001`

- **Decision ID**: `DECISION-ci-runtime-reduction-001`
- **Decision Statement**: Use `actions/cache@v4` keyed on the **exact installed Playwright version**
  to persist `~/.cache/ms-playwright` between runs, instead of downloading Chromium on every run.
- **Considered Options**:
  1. `actions/cache@v4` + exact Playwright version key + no `restore-keys`.
  2. `actions/cache@v4` + `hashFiles('package-lock.json')` key.
  3. Do nothing; accept 152–453 s per run.
- **Selected Option(s)**: Option 1.
- **Rejected Option(s)**: Option 2 — any unrelated dependency bump invalidates the cache and pays the
  full download again, which is the exact cost being removed. Option 3 — this is the largest single
  recoverable cost measured. `restore-keys` are deliberately omitted: a partial browser set from a
  different Playwright revision is worse than a clean miss.
- **Material Claim Links**: `[CLAIM-DECISION-ci-runtime-reduction-001-001](#CLAIM-DECISION-ci-runtime-reduction-001-001)`,
  `[CLAIM-DECISION-ci-runtime-reduction-001-002](#CLAIM-DECISION-ci-runtime-reduction-001-002)`
- **Remaining Uncertainty**: `None` — the cache behaviour and limits are documented by the vendor and
  the install path is measured in §3.4.
- **Decision Owner**: Repository owner (heyLoey)
- **Status**: `proposed`

##### Version Selection Fields

- **Version Selection Context**: `Existing project` — `.github/workflows/test.yml` already uses
  `actions/checkout@v4` and `actions/setup-node@v4`; `actions/cache@v4` matches that major-version
  convention. Playwright stays at the lock-resolved **1.63.0**; no upgrade is part of this work.
- **AI Recommendation**: `actions/cache@v4`, Playwright unchanged at 1.63.0.
- **Selected Exact Version(s)**: `actions/cache@v4`; Playwright `1.63.0` (from
  `package-lock.json`, confirmed by `npx --no-install playwright --version`).
- **Release Channel**: `stable`
- **Support/Lifecycle Status**: `actions/cache@v4` is the current supported major of GitHub's own
  cache action; Playwright 1.63.0 is the project's installed stable release.
- **Compatibility Constraints**: Linux runners only (`~/.cache/ms-playwright` is the Linux default);
  cache restores are branch-scoped (see claim 002); no Windows or macOS job exists.
- **Version Rationale**: Matches the repo's existing `@v4` action pins and avoids a Playwright bump
  inside a CI-runtime change.
- **Exact-Version Evidence**: `npx --no-install playwright --version` → `Version 1.63.0` (2026-10-23);
  `npx --no-install playwright install --dry-run chromium` → install root
  `/home/heyloey/.cache/ms-playwright/chromium-1243` (2026-10-23).
- **Existing Version Baseline**: `@playwright/test: ^1.48.0`, lock-resolved to `1.63.0`; preserved.
- **Decision Owner Approval or Accepted Assumption**: Pending — owner approval is the sign-off in §7.
- **pk:spike or ADR Link**: `None`

<a id="CLAIM-DECISION-ci-runtime-reduction-001-001"></a>
#### Material Claim Record: `CLAIM-DECISION-ci-runtime-reduction-001-001`

- **Claim ID**: `CLAIM-DECISION-ci-runtime-reduction-001-001`
- **Decision Link**: `[DECISION-ci-runtime-reduction-001](#DECISION-ci-runtime-reduction-001)`
- **Material Claim**: `actions/cache` restores by exact key, saves a new cache only when the job
  completes successfully, and applies a default 10 GB per-repository storage limit with 7-day
  idle eviction.
- **Citation or Uncertainty Link**: `[CITATION-DECISION-ci-runtime-reduction-001-001](#CITATION-DECISION-ci-runtime-reduction-001-001)`

<a id="CLAIM-DECISION-ci-runtime-reduction-001-002"></a>
#### Material Claim Record: `CLAIM-DECISION-ci-runtime-reduction-001-002`

- **Claim ID**: `CLAIM-DECISION-ci-runtime-reduction-001-002`
- **Decision Link**: `[DECISION-ci-runtime-reduction-001](#DECISION-ci-runtime-reduction-001)`
- **Material Claim**: Caches created by a `pull_request` run are scoped to the merge ref and cannot
  be restored by the base branch or by other pull requests; caches created by a `push` to the default
  branch are restorable by pull requests.
- **Citation or Uncertainty Link**: `[CITATION-DECISION-ci-runtime-reduction-001-002](#CITATION-DECISION-ci-runtime-reduction-001-002)`

<a id="CITATION-DECISION-ci-runtime-reduction-001-001"></a>
#### Citation Record: `CITATION-DECISION-ci-runtime-reduction-001-001`

- **Citation ID**: `CITATION-DECISION-ci-runtime-reduction-001-001`
- **Publisher**: GitHub
- **Document Title**: Dependency caching reference
- **Canonical URL**: https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
- **Access Date**: `2026-10-23`
- **Supported Claim Link**: `[CLAIM-DECISION-ci-runtime-reduction-001-001](#CLAIM-DECISION-ci-runtime-reduction-001-001)`
- **Citation Status**: `verified`

<a id="CITATION-DECISION-ci-runtime-reduction-001-002"></a>
#### Citation Record: `CITATION-DECISION-ci-runtime-reduction-001-002`

- **Citation ID**: `CITATION-DECISION-ci-runtime-reduction-001-002`
- **Publisher**: GitHub
- **Document Title**: Dependency caching reference — Restrictions for accessing a cache
- **Canonical URL**: https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
- **Access Date**: `2026-10-23`
- **Supported Claim Link**: `[CLAIM-DECISION-ci-runtime-reduction-001-002](#CLAIM-DECISION-ci-runtime-reduction-001-002)`
- **Citation Status**: `verified`

---

## 1. Executive Summary & Problem Statement

Both CI lanes are one job. `pull_request` and `push: main` run the same thirteen steps serially, and
both take far longer than they should. Measured on the two most recent green runs: **18.2 min** on a
PR and **21.8 min** on `main`. The user's report — "more than 10 min" — is real, and the true figure
is worse.

The time is not spread evenly. Three steps own it: the Playwright browser download (**152 s** on the
PR run, **453 s** on the `main` run — the same step, a 5-minute spread from network alone), the E2E
suite (**387–420 s**), and the API route-handler suites (**208–249 s**). Everything else — checkout,
`npm ci`, lint, typecheck, unit + integration, preflight — totals under 90 s.

This spec removes what is *provably* waste, at zero increase in billed minutes: a browser download
repeated on every run, six Supabase services the suite never touches, and a teardown step on a
virtual machine that is about to be destroyed. It deliberately does **not** reshape the gate. The
honest outcome is a projected **~14.5–16 min** on both lanes, not under 10; §8 prices the remaining
levers and says why each is a separate decision.

---

## 2. Goals and Explicit Non-Goals

### Goals (In Scope)

- **G1**: Stop re-downloading Playwright browsers on every run; restorability verified on the
  `main` (cache-seeding) lane and on a PR lane.
- **G2**: Run CI's local Supabase stack with the same exclusions as `npm run db:up`.
- **G3**: Remove teardown work that cannot affect a hosted, ephemeral runner.
- **G4**: No increase in billed runner-minutes. No step materially slower than baseline.
- **G5**: A recorded before/after step table from real runs, not projections.

### Non-Goals (Explicit Scope Boundary)

- **N1**: Splitting the job into parallel jobs. It lowers wall-clock but duplicates checkout,
  `npm ci`, and a ~2.5 min Supabase boot per job, so total billed minutes rise — declined by the
  owner's "wall-clock and billed minutes together" choice.
- **N2**: Sharding E2E or raising Playwright's worker count above the default 2. `PROMPTKIT.md` §3
  records `#80`'s shared fixture-id collisions at 2 workers on this 4-CPU box; more workers trades a
  known flake for minutes.
- **N3**: Changing any test, budget, assertion, or gate threshold — including the four Lighthouse
  scores of 100 and the `sla.spec.ts` ceilings.
- **N4**: Skipping or narrowing the post-merge `main` run. `test.yml`'s own header records the
  invariant that every code revision on `main` gets a CI verdict; the 110 min that
  `cancel-in-progress` would reclaim on `main` was deliberately declined for the same reason.
- **N5**: Caching Docker/Supabase images with `docker save`/`load`. Plausible, but 1–2 GB of cache,
  a bespoke script, and a new failure mode; it is not "obvious waste". §8 prices it.
- **N6**: Replacing `next dev` with a production server for the API suites. It may be the right
  long-term answer, but it changes test infrastructure, not CI waste. §8 prices it.
- **N7**: Upgrading Playwright, Supabase CLI, Node, or any action major.
- **N8**: Adding or changing branch protection/rulesets. Verified none exist; not this task's job.

---

## 3. Architecture & System Context

### 3.1 Current shape (one job, thirteen serial steps)

```text
checkout (full history) ─► setup-node (npm cache) ─► npm ci
    ├─► lint ──► typecheck ──► check-set-config.sh
    └─► supabase start ──► preflight ──► npm test ──► npm run test:api
                                                        │
                          playwright install ◄──────────┘
                                  └─► npm run test:e2e  (webServer: npm run build && npm run start)
                                  └─► supabase stop  [if: always()]
```

Two properties matter and are preserved:

1. **Every step is a gate.** Lint is cheap and runs first; E2E is deliberately last because it is the
   only step that boots a production build, which is what makes its latency numbers quotable.
2. **The job is the lane.** PR and `main` share the definition, so one edit serves both. That is why
   the scope question ("pre and post") collapsed to a single change.

### 3.2 Deep module note

Not applicable — configuration work. There is no module seam to design; the "interface" is the step
list, and the deletion test is applied literally to the `Stop Supabase` step: deleting it concentrates
no complexity anywhere, it removes work whose only consumer is a VM that is about to disappear.

### 3.3 State ownership

| State | Owner | Invalidation |
|---|---|---|
| Playwright browser binaries | Actions cache, keyed by exact Playwright version | Version change → new key → clean miss |
| Supabase local stack | Docker on the runner, booted per job | Job end; the VM is discarded |
| npm dependencies | `setup-node` cache, keyed by lockfile hash | Lockfile change |
| Job verdict | GitHub Actions run history | Never rewritten |

<a id="baseline"></a>
### 3.4 Measured baseline

Captured 2026-10-23 from the two most recent green runs, via
`gh run view <id> --json jobs` and per-step `startedAt`/`completedAt`.

| # | Step | PR run `39886239089` (18.2 min) | `main` push `39888699197` (21.8 min) |
|---:|---|---:|---:|
| 1 | Set up job | 1 s | 1 s |
| 2 | Checkout code (`fetch-depth: 0`) | 3 s | 3 s |
| 3 | Setup Node.js | 6 s | 4 s |
| 4 | Install dependencies (`npm ci`) | 27 s | 18 s |
| 5 | Lint | 9 s | 7 s |
| 6 | **Start Supabase** | **153 s** | **174 s** |
| 7 | Run type check | 12 s | 10 s |
| 8 | Security check (`set_config` ban) | 0 s | 0 s |
| 9 | Preflight integration environment | 1 s | 1 s |
| 10 | Run test suite (unit + integration) | 28 s | 23 s |
| 11 | **Run API route-handler suites** | **249 s** | **208 s** |
| 12 | **Install Playwright browsers (with deps)** | **152 s** | **453 s** |
| 13 | **Run E2E suite (incl. production build)** | **420 s** | **387 s** |
| 14 | Stop Supabase (`if: always()`) | 26 s | 16 s |
|  | Post steps (Node cache, checkout) | 0 s | 1 s |
|  | **Job total** | **1 091 s** | **1 309 s** |

The install step is the only one whose cost is dominated by the network: **two runs doing identical
work differ by 301 s on that step alone.** That variance is the strongest argument for caching it,
and the reason its saving is quoted as a range rather than a number.

---

## 4. Detailed Design & Contracts First

### 4.1 Contract: step names and job identity (locked invariant)

```text
workflow name:      Test Suite
job id:             test
preserved step names:
  - "Install Playwright browsers (with system libraries)"   (renamed only if unavoidable)
  - "Start Supabase"
  - "Run E2E suite against the production build"
```

No required-check consumer exists today (verified: no protection, no rulesets). The names are frozen
anyway; `docs/STATE.md` cites `main`'s last CI-green revision by SHA, and humans search run logs by
these names.

### 4.2 Change 1 — Playwright browser cache (G1)

Insert two steps immediately before the existing install step, and keep the install command itself
unchanged:

```yaml
      - name: Resolve Playwright version
        id: playwright-version
        run: |
          version="$(npx --no-install playwright --version | awk '{print $2}')"
          if [ -z "$version" ]; then
            echo "::error::Could not resolve the installed Playwright version"
            exit 1
          fi
          echo "version=$version" >> "$GITHUB_OUTPUT"

      - name: Restore Playwright browsers
        id: playwright-cache
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: ${{ runner.os }}-playwright-${{ steps.playwright-version.outputs.version }}

      - name: Install Playwright browsers (with system libraries)
        run: npx playwright install --with-deps chromium
```

Design points, each tied to an observed fact:

- **Exact version key, no `restore-keys`.** Playwright 1.63.0 puts Chromium, its headless shell, and
  ffmpeg under `~/.cache/ms-playwright` (verified by
  `npx --no-install playwright install --dry-run chromium`: `chromium-1243`,
  `chromium_headless_shell-1243`, `ffmpeg-1011`). A partial set from another revision is worse than
  a clean download.
- **`--no-install` on the version probe.** The repo pins `playwright` transitively through
  `@playwright/test`; `npx` must not reach the network to answer a version question. The probe is
  guarded because a failed command substitution inside `echo` still exits 0 — without the empty check,
  a broken probe would write `version=` and every later run would restore that poisoned key.
- **`--with-deps` stays.** The browser download is cached; the `apt` system libraries are not. This is
  what keeps the step correct on a cache hit instead of trading a green gate for a faster red one.
- **No `continue-on-error`, no `if:` guard around the install.** A cache hit must still execute the
  install command; it is Playwright, not the workflow, that decides the browsers are present.
- **Cache scope is a feature, not a detail.** Per claim 002, a `push` run on `main` writes a cache
  that every PR can restore, while a `pull_request` run writes only to `refs/pull/N/merge` and is
  invisible to other PRs. Consequence: **the first run after this lands will miss on both lanes and
  must not be read as a failure of the change.** The `main` run seeds the shared cache for every
  later PR.

Size: Chromium + headless shell + ffmpeg are roughly 300–450 MB, against a documented 10 GB
per-repository limit and 7-day idle eviction. Eviction produces a miss, never a failure.

### 4.3 Change 2 — Supabase stack parity (G2)

```yaml
      - name: Start Supabase
        run: npx supabase start -x realtime,storage-api,imgproxy,edge-runtime,logflare,vector
```

This is exactly what `npm run db:up` already does locally. Every suite in the repo was developed and
debugged against that reduced stack, so CI has been running a **superset** of the stack the tests
actually need — the reverse of the usual risk.

Evidence the exclusions are safe (grepped `src/`, `lib/`, `db/`, `scripts/`, `tests/`, and
`playwright.config.ts` on 2026-10-23): no reference to Supabase Storage, Realtime, Studio, Edge
Runtime, Logflare, or Vector. The only `realtime` references are ADR-0007's comment and its mention
in `tests/e2e/sla.spec.ts`, both recording that Realtime is deliberately unused. Every `storage`
match is the client-side IndexedDB outbox (`src/app/state/outbox.ts`) or `MemoryStorage` in tests —
never the service.

`gotrue`, `kong`, `postgrest`, `postgres-meta`, `mailpit`, and `supavisor` stay. `mailpit` in
particular must stay: `supabase/config.toml` enables `[local_smtp]` (the local mail service), and a
sign-in path that enqueues mail fails when its SMTP target is absent.

Excluded-service list is taken from the pinned CLI's own help output
(`npx --no-install supabase start --help`, v2.117.0), not from memory.

### 4.4 Change 3 — delete the teardown step (G3)

Remove:

```yaml
      - name: Stop Supabase
        run: npx supabase stop
        if: always()
```

`runs-on: ubuntu-latest` is a fresh VM per job and is destroyed with the job. Nothing after this step
reads the database, and nothing outside the job can see the containers. The only consumer of a clean
shutdown is a local `act` run, which this repo has no evidence of using; the spec records that if
`act` is ever adopted, this step comes back behind `if: always() && env.ACT`.

Measured saving: 16–26 s per run, and it is pure deletion.

### 4.5 What is deliberately *not* changed

| Candidate | Why not |
|---|---|
| `fetch-depth: 0` (3 s) | `legacy-parity.spec.ts` needs `origin/main` and a merge base; the header comment documents the run where CI silently skipped it. |
| `supabase start` replaced by a Postgres service container | Loses GoTrue/Kong/PostgREST; the API and E2E suites authenticate through them. |
| `.next` build cache | The production build is inside `webServer`; measured locally at **5.4 s** (`docs/releases/ci-triage/gate-local-89418d5.md`, stage 7), so caching it is noise, not a lever. |
| `npm ci` → `npm install` | 18–27 s, already lockfile-cached. |
| Reordering steps | No total change in a serial job; churn without a measurable outcome. |
| `timeout-minutes` on the job | A safety net, not a runtime reduction. Out of scope. |

---

## 5. Security, Privacy & Failure Modes (FMEA)

### Security & Tenancy Audit

- **Tenancy boundary**: `N/A` — no product data path changes; single-user app, no multi-tenancy.
- **Authentication & RBAC**: `N/A` — no auth code touched. CI continues to authenticate test users
  through the same GoTrue service.
- **Input sanitization**: `N/A` — no runtime input surface. The only new inputs are a workflow
  expression and a version string parsed from a local binary into `$GITHUB_OUTPUT`; the value is
  quoted by the shell and never interpolated into a `run:` body.
- **Secrets & PII**: **no new secrets**. The workflow's committed Supabase values are the
  well-known local-dev defaults (public by design, per the existing comment and `.env.example`). The
  cache holds browser binaries only — no tokens, no `.env`, no test user credentials. GitHub's own
  guidance ("don't store sensitive information in a cache") is satisfied by construction.
- **Supply chain**: `actions/cache@v4` is GitHub-owned and matches the repo's existing `@v4` pins. A
  cached browser binary is executed by the E2E gate, so cache provenance matters — see the
  poisoning row below.

### FMEA Matrix

| Failure Scenario | Probability / Severity | Detection Method | Mitigation / Fallback | Recovery Strategy |
|---|---|---|---|---|
| First post-merge run misses the cache (nothing on `main` yet) and pays the full download | High / Low | `playwright-cache` step log says miss; install step ≈ baseline | Expected and documented; do not gate the change on run 1 | Run 2 on `main` or any later PR hits |
| PR run misses because caches are merge-ref-scoped | High / Low | install step ≈ baseline on the PR's first run | Documented in §4.2; PR run 2 (or a re-run) hits | Push a follow-up commit or re-run |
| Playwright/Node upgrade leaves a stale browser set | Low / Medium | Key changes on version bump → clean miss, by design | Exact-version key, no `restore-keys` | Cache re-seeds automatically; old entry evicted |
| Corrupted/partial cache entry | Low / Medium | E2E fails at `browserType.launch`, not at an assertion | Rerun once (documented timing-gate convention does **not** apply here — this is a launch error) | `gh cache delete <key>`; next run re-downloads |
| Cache poisoning from an untrusted PR | Low / High | Only matters if a poisoned entry reaches `main`'s scope | PR caches are write-scoped to `refs/pull/N/merge` and cannot be restored by the base branch; `cache-mode: write` is never set, so default scoping applies | Delete the entry; no fork PRs exist today (single contributor) |
| `-x` hides a service a future test needs | Low / Medium | Red suite with a connection/404 error on a Supabase endpoint | Local `db:up` parity means the same suite fails locally first, before CI | Remove the service from the flag; one line |
| Dropping `supabase stop` leaves containers in a local `act` run | Low / Low | `act` output / leftover containers | Hosted runners are unaffected; documented in §4.4 | Re-add behind `if: always() && env.ACT` |
| Cache storage pressure causes thrashing | Low / Low | `gh api repos/{owner}/{repo}/actions/caches`; eviction warnings | ~400 MB against 10 GB; idle entries expire in 7 days | Delete the entry; the step degrades to today's behaviour |
| A green-looking run that skipped the gate | Low / High | **Forbidden by design**: no `continue-on-error`, no `if:` on the install, no change to any test command | Review diff for those three patterns before merge | Revert |

---

## 6. Implementation Milestones

**Work type**: Configuration. **Task Record TDD mode**: expected `disabled` (the proposal above is
reference-only). Exception verification path applies: acceptance → evidence → review → verification.

- [ ] **M1 — Browser cache.**
  - Add the version-probe and cache steps from §4.2; leave the install command untouched.
  - Acceptance: `git diff` touches only `.github/workflows/test.yml`; the cache step uses the exact
    version key with no `restore-keys`; `--with-deps` and `--no-install` are present as specified.
  - Evidence: PR run 1 (miss, install ≈ 152–453 s, cache saves), PR re-run (hit, install ≤ 60 s).
- [ ] **M2 — Supabase parity + teardown deletion.**
  - Apply §4.3 and §4.4.
  - Acceptance: `Start Supabase` uses the six exclusions; `Stop Supabase` is gone; no test file or
    script changed.
  - Evidence: the same run's `Start Supabase` duration and a green `npm test`, `test:api`, `test:e2e`.
- [ ] **M3 — Both-lane verification and record.**
  - Wait for the first `push` run on `main` (seeds the shared cache), then the next PR run (hits it).
  - Produce the before/after table from real runs, reusing §3.4's exact method.
  - Append the result to `docs/releases/ci-triage/ci-cost-measurement.md` (repo convention for CI
    measurements) and update `docs/STATE.md`'s CI facts.
  - Acceptance: every step's duration is quoted from `gh run view --json jobs`; no number is a
    projection; a slower step is reported as slower.

**Sign-off readiness**: milestone branch, Task Record, acceptance criteria, review path, and
verification condition are recorded here and are handed to `pk:tasks`. Planning does not authorize
implementation.

---

## 7. Acceptance Criteria

| ID | Criterion | Verification |
|---|---|---|
| `AC-1` | On a cache hit, the Playwright install step is ≤ 60 s on both lanes | `gh run view --json jobs`, step 12 |
| `AC-2` | On a cache miss, the install still succeeds and E2E launches a browser | First post-merge run: install ≈ baseline, E2E green |
| `AC-3` | `Start Supabase` is not slower than its lane's baseline (153 s PR / 174 s `main`) | Step 6, same command |
| `AC-4` | Unit + integration, API, and E2E are all green with the reduced Supabase stack | Same run's steps 10, 11, 13 |
| `AC-5` | No `continue-on-error`, no `if:` on the install step, no test command changed | `git diff` review |
| `AC-6` | Job total is lower than the 1 091 s / 1 309 s baselines on the same lanes | `gh run view` job `startedAt`/`completedAt` |
| `AC-7` | The measured before/after table is recorded in `docs/releases/ci-triage/ci-cost-measurement.md` and `docs/STATE.md` is updated | Files read after the run |
| `AC-8` | Billed-minute direction is non-increasing: no new job, no duplicated boot | Workflow diff shows a single job |

**Projected, not measured** (the whole point of M3):

| Lane | Baseline | Projected after | Projected saving |
|---|---:|---:|---:|
| PR | 18.2 min | ~14.7–15.8 min | ~2.4–3.5 min |
| `main` push | 21.8 min | ~13.5–14.5 min | ~7–8.5 min |

The two lanes converge because the one wildly variable step (browser download) stops being on the
critical path. **The residual floor is E2E (~6.5–7 min) + API (~3.5–4 min) + Supabase (~2–2.5 min),
which is why this plan does not promise under 10 minutes.**

---

## 8. Remaining Levers (priced, deliberately out of scope)

| Lever | Wall-clock | Billed minutes | Risk / cost | Disposition |
|---|---|---|---|---|
| E2E workers 2 → 4 | ~2–3 min | same | `#80` fixture-id collisions: a known flake becomes a likely one; needs fixture isolation first | **Later ledger** — needs its own task, not a CI-runtime change |
| API suite: one shared server instead of 14 cold boots | ~2–3 min | same | Every file currently spawns its own `next dev` (`tests/integration/api/test-server.ts`); a `globalSetup` server changes test infrastructure | **Later ledger** — spike, then decide |
| Cache Supabase Docker images (`docker save`/`load`) | ~1.5–2.5 min | same | 1–2 GB cache, bespoke script, new corruption mode | **Later ledger** — only if the first two are declined |
| Split into 2 parallel jobs | ~6–9 min | **+1–2 min** | Duplicated checkout, `npm ci`, and 2.5 min Supabase boot | **Declined** — violates G4 |
| Skip the `main`-lane re-run | ~14 min | ~14 min | Removes the "every `main` revision has a verdict" invariant | **Declined** — N4 |
| `cancel-in-progress: true` on `main` | 0 | ~110 min over 12 runs | Ends cancelled revisions with no verdict | **Declined** — already decided in `test.yml` |

---

## 9. Sign-off & Grilling Checklist

- [x] Design challenged against measured run data; every material gap has a disposition (resolved in
      §4, priced in §8, or recorded as `ASSUMPTION-…-001`/`-002`).
- [x] Zero-downtime database evolution: `N/A` — no schema, data, or migration change.
- [x] Non-goals agreed with the owner (both lanes; wall-clock **and** billed minutes; obvious waste
      only).
- [ ] Owner approval of `DECISION-ci-runtime-reduction-001` and this spec.
- [ ] Ready for `pk:tasks` to create the Local Task Record (`docs/tasks/<task-id>.md`) with the
      Configuration exception verification path.
- [ ] `pk:grill` probe, if the owner wants the FMEA rows tested before implementation.
