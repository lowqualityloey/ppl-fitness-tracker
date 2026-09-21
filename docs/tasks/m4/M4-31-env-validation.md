<a id="TASK-m4-31-env-validation"></a>

# Task Record: M4-31 — fail-fast startup environment validation

> **Why this card exists:** it is blocker **B4** from
> `docs/releases/2026-09-21-v1.0.0-release-readiness.md`, filed as issue **#174**. It is
> `pk:ship` anti-pattern #1 verbatim: "unvalidated environment variables — silent crashes
> hours after deploy when missing secrets are first accessed."

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-m4-31-env-validation`
- **PromptKit Adaptation Profile**: `none`
- **Work Type**: `Code Work`
- **Planning Record Link**: `N/A`
- **Planning Depth Reference**: `Minimal`
- **Assumption Record Links**: `None`
- **Specification**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md` (blocker B4) + issue **#174**
- **External Reference**: **#174** (`feat(env): validate required environment variables at startup (M4-31, blocker B4)`)
- **Owner / Actor**: Agent (Freebuff/Buffy); owner authorized by selecting #174
- **Execution Scope**: a new env module, the instrumentation boot hook, and its control
- **Approval Boundary**: **no tag, push, deploy, or rollback.** A production boot behaviour changes, so the deploy decision stays with the owner
- **Created**: `2026-09-21 14:30 UTC`

## 2. Objective and Boundaries

- **Objective**: a server process started with a missing or malformed required environment
  variable **fails at boot**, naming the variable, instead of failing at the first query or
  request — and the failure never prints the variable's value.
- **In Scope**:
  - `lib/env/server.ts` — the schema, a pure `assertServerEnv(raw)`, and an `EnvValidationError`
  - `src/instrumentation.ts` — call the assertion on the Node runtime, **skipping the build phase**
  - `tests/unit/infra/env-validation.test.ts` — the behavioural control plus a static wiring guard
- **Explicit Non-Goals**:
  - **Not touching `lib/db/client.ts`.** The issue body listed it as "touched"; it is deliberately
    left alone: `getDb()` already throws naming `DATABASE_URL`, it is called by scripts and tests
    that inject a connection string, and `tests/unit/db/client.test.ts` manipulates
    `process.env.DATABASE_URL` to assert that throw. Routing it through a cached parse would couple
    that unit test to the cache with no gain — the boot assertion is what closes B4.
  - Provisioning or rotating values; adding any new required variable
  - Adopting `@t3-oss/env-nextjs` (hand-written Zod is already this repo's vocabulary)
  - Validating `MIGRATION_DATABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` — **neither is a runtime
    requirement**, and requiring them would break the deploy
- **Dependencies**: `None`
- **Risk**: `Medium` — a wrong assertion set breaks the deploy rather than a request. Mitigated by
  deriving the required set from a measured census of `process.env` reads in `lib/` and `src/`,
  and by explicitly excluding the two non-runtime keys.
- **Verification Condition**: `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/unit/infra/env-validation.test.ts` exits 0 **after** being observed failing, and a real `next start` with `DATABASE_URL` emptied exits non-zero naming the variable.

## 3. Acceptance Criteria

- [x] **AC-1**: A complete environment parses and returns typed values.
  - **Result**: `Pass` · **Evidence**: unit case 1
- [x] **AC-2**: A missing required variable fails the boot, **naming it**.
  - **Result**: `Pass` · **Evidence**: unit case 2, plus the **real boot probe** — `DATABASE_URL= npm run start` → **exit 1**, log line `refusing to start: invalid environment configuration`, message `DATABASE_URL is present but empty`
- [x] **AC-3**: One failure names **every** missing variable, not just the first.
  - **Result**: `Pass` · **Evidence**: unit case 3
- [x] **AC-4**: The message never contains a **value**. A distinctive secret-shaped value is passed in and asserted absent from the message.
  - **Result**: `Pass` · **Evidence**: unit case 4 — three cases, including a secret-shaped **sibling** of the failing variable, which is the realistic leak
- [x] **AC-5**: A malformed value names the variable and a reason.
  - **Result**: `Pass` · **Evidence**: unit case 5
- [x] **AC-6**: Absent optionals (`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_RELEASE`, `LOG_LEVEL`) do **not** fail.
  - **Result**: `Pass` · **Evidence**: unit case 6
- [x] **AC-7**: `MIGRATION_DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **not** required.
  - **Result**: `Pass` · **Evidence**: unit case 7
- [x] **AC-8**: The wiring cannot silently vanish — a static guard asserts `instrumentation.ts` calls the assertion, skips the build phase, and **exits non-zero** on failure.
  - **Result**: `Pass` · **Evidence**: unit case 8
- [x] **AC-9**: Existing gates still pass.
  - **Result**: `Pass` · **Evidence**: §6 gate table
- [x] **AC-10 — ADDED BY MEASUREMENT**: the build is not broken by the assertion.
  - **Result**: `Pass` · **Evidence**: `DATABASE_URL= npm run build` → **exit 0 with zero `EnvValidationError` occurrences**. This is the exclusion proven rather than assumed: that build would have failed if the guard were wrong.
- [x] **AC-11 — ADDED BY MEASUREMENT**: one reason per variable, not one per failing constraint.
  - **Result**: `Pass` · **Evidence**: unit case 9. The first implementation printed `2 problem(s)` and named `DATABASE_URL` **twice** for a single empty value, because `.min(1).url()` emits two issues.
- [x] **AC-12 — ADDED BY MEASUREMENT**: the healthy path still boots and serves.
  - **Result**: `Pass` · **Evidence**: `next start` → `Ready in 388ms`; `GET /api/health` → **HTTP 200**, body `{"ok":true,"data":{"status":"ok","db":{"ok":true,"latencyMs":68.8}}}`; zero `refusing to start` lines in the good-boot log

> **AC-10/11/12 exist because the first implementation was wrong in three ways that only running it revealed.**
> AC-2's own wording — "it exits and serves no request" — was the one that failed hardest: `register()` throwing is
> **not** enough, because Next logged `Failed to prepare server`, logged the unhandled rejection, and then kept the
> process **alive and serving** until `timeout` killed it at 45 s (exit 124). That is the original anti-pattern with
> a nicer message. The fix is an explicit `process.exit(1)` after reporting, and unit case 8 now asserts it so the
> exit cannot be refactored away.

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled`
- **Batch Authorization**: `N/A`
- **Soft Checkpoint**: `~60 minutes`
- **Hard Checkpoint**: `at or before 90 minutes`
- **Event-Driven Checkpoints**: scope expansion, blocker, handoff
- **Stop Conditions**: failed gate, unexpected scope growth, developer stop
- **Host Timer Capability**: `POLICY_LIMITATION` — turn counts observable, wall-clock not; no mechanical enforcement claimed

## 5. State and Active Ownership

- **Execution State**: `awaiting_review`
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-09-21 14:30 UTC`
- **Current Actor**: Agent (Freebuff/Buffy)
- **Next Action**: owner commits; then issue **#174** can be closed on the landed revision (keywords stay out of issue text per item 43)

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `planned` | `in_progress` | `2026-09-21 14:30 UTC` | Agent | owner selected #174 | issue #174 |
| `in_progress` | `awaiting_review` | `2026-09-21 14:50 UTC` | Agent | all gates green; three defects found by measurement were fixed and controlled | §6 gate table |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `lib/env/server.ts` — **new**; `ServerEnvSchema` (4 required names, derived from a census of `process.env` reads), `EnvValidationError`, pure `assertServerEnv(raw)`
  - `src/instrumentation.ts` — calls the assertion on the Node runtime, **excluded during `phase-production-build`**, and `process.exit(1)` after reporting a failure
  - `tests/unit/infra/env-validation.test.ts` — **new**; 10 cases including the wiring guard
  - `docs/releases/2026-09-21-v1.0.0-release-readiness.md` — B4 closed
  - `docs/STATE.md` — §3 surface + §7 item 49 + §8 row
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**:

  | Gate | Command | Result |
  | :--- | :--- | :--- |
  | Watched RED | `vitest run tests/unit/infra/env-validation.test.ts` (module absent) | **Cannot find module `../../../lib/env/server`** — a *resolution* red, not an assertion red, and reported as such |
  | Green | same command, module present | **10 passed / 10** |
  | **Boot probe (bad)** | `DATABASE_URL= npm run start` | **exit 1** (first run, before the fix: **exit 124** — killed by `timeout`, i.e. still serving); message names `DATABASE_URL` |
  | **Boot probe (good)** | `next start` + `GET /api/health` | **HTTP 200** with a live `latencyMs`; `Ready in 388ms`; zero refusals |
  | **Build exclusion** | `DATABASE_URL= npm run build` | **exit 0**, zero `EnvValidationError` occurrences |
  | typecheck | `npm run typecheck` | exit **0** |
  | lint | `npm run lint` | exit **0** (`--max-warnings=0`) |
  | unit | `npm test` | **66 files / 638 tests** (was 65/628; the +10 are this file) |
  | api | `npm run test:api` | **14 files / 84 tests**, preflight green |
  | e2e | `npm run test:e2e -- --workers=1` | **81 passed (6.0 m)** — load-bearing here, since instrumentation is on the path the harness boots |
  | Build noise | — | `public/sw.js` re-stamped by two builds; **discarded**, not committed |
- **Behavior IDs**: `N/A - TDD Enforcement Mode disabled`
- **TDD Intent Register**: `N/A - TDD Enforcement Mode disabled`
- **TDD Execution Evidence**: `N/A - TDD Enforcement Mode disabled`
- **TDD Exception Verification**: `N/A - Code Work`
- **CI Evidence**: not yet
- **Review Evidence**: `N/A` — awaiting owner review
- **Commit Evidence**: `N/A before commit`
- **Pull Request Evidence**: `N/A`
- **Release Evidence**: closes **B4** in `docs/releases/2026-09-21-v1.0.0-release-readiness.md`
- **Blocker and Resume Condition**: `None`

- **Completion State**: `awaiting_review`
- **Acceptance Results**: `AC-1 … AC-12 all Pass`
- **Changed-File Summary**: one new module, one boot-hook change, one new control file, two docs — **no schema, migration, route, auth, or `lib/db/client.ts` change** (that last one deliberately, per §2)
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Pending` — awaiting owner commit decision

### Deviations From The Filed Issue (#174), Recorded Rather Than Smoothed

1. **`lib/db/client.ts` was left untouched**, though the issue body listed it as "touched". It already throws naming `DATABASE_URL`, it is called by scripts and tests that inject a connection string, and `tests/unit/db/client.test.ts` manipulates `process.env.DATABASE_URL` to assert that throw — coupling it to a cached parse would break that control for no gain. The boot assertion is what closes B4.
2. **Three acceptance criteria were added** (AC-10/11/12) after the first implementation failed on them. The card is more honest for carrying them than the original nine were.
3. **The failure path is an explicit exit, not a throw.** Next tolerates a throwing instrumentation hook; B4 does not.
