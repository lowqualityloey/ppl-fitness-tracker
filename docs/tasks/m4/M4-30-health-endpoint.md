<a id="TASK-m4-30-health-endpoint"></a>

# Task Record: M4-30 — `GET /api/health`, the release probe's target

> **Why this card exists:** it is blocker **B3** from
> `docs/releases/2026-09-21-v1.0.0-release-readiness.md`. `pk:ship` requires a
> post-deploy health probe, and this repository had **no health route at all** — 11
> `route.ts` files, none of them health — so the mandatory smoke test had no target and
> a platform-level 200 could not be distinguished from "the application never booted".

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-m4-30-health-endpoint`
- **PromptKit Adaptation Profile**: `none`
- **Work Type**: `Code Work`
- **Planning Record Link**: `N/A`
- **Planning Depth Reference**: `Minimal` (single route, one contract, no schema/auth change)
- **Assumption Record Links**: `None`
- **Specification**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md` §4 (the probe table that named the gap)
- **External Reference**: none filed — B3 was found by the `pk:ship` census, not by an issue
- **Owner / Actor**: Agent (Freebuff/Buffy); owner authorized the work in-session
- **Execution Scope**: one new contract module, one new route, one new integration spec, two closed route registries
- **Approval Boundary**: **no tag, push, deploy, or rollback** — this is code work only; the release decision stays with the owner
- **Created**: `2026-09-21 13:50 UTC`

## 2. Objective and Boundaries

- **Objective**: `GET /api/health` answers `200` in the canonical envelope with a real
  database ping and `no-store`, so the release runbook has a probe that can distinguish
  "server up" from "server cannot reach its database".
- **In Scope**:
  - `lib/contracts/health.ts` — the response contract (routes own no shapes here)
  - `src/app/api/health/route.ts` — thin adapter, wrapped in `loggedRoute`
  - `tests/integration/api/health.test.ts` — the behavioral spec
  - `tests/unit/api/contract-graph.test.ts` + `tests/unit/api/route-scope.test.ts` — the two
    closed registries a new route must join
- **Explicit Non-Goals**:
  - **Startup env validation (B4)** — separate card; bundling it would hide a boot-path change inside a probe card
  - **Deployment Protection (B1)** — Vercel dashboard, owner-only
  - **Auth, healing, readiness vs liveness split, metrics** — a health route that grows a
    `?verbose=1` mode is a monitoring system; that is a different decision
  - **Excluding `/api/health` from the middleware matcher** — that would skip the CSP seam
    (#142's "CSP on every response") and change the nonce/cookie path to save one auth hop.
    Deliberately **not** done; the cost is named as a residual below instead
- **Dependencies**: none
- **Risk**: `Low` — additive route, no schema, no auth, no data
- **Verification Condition**: `node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/api/health.test.ts` exits 0, **after** being observed failing.

## 3. Acceptance Criteria

- [x] **AC-1**: The route answers 200 in the canonical envelope, parsed by the shared contract.
  - **Result**: `Pass`
  - **Evidence**: `tests/integration/api/health.test.ts` — `HealthResponseSchema.safeParse` succeeds; 3/3 green
- [x] **AC-2**: The 200 carries a **real** database round trip, not a hardcoded literal.
  - **Result**: `Pass`
  - **Evidence**: `getDb().execute(sql\`SELECT 1\`)`; the spec asserts `latencyMs` is finite and `>= 0` and that the request costs ~444–821 ms against the dev harness, i.e. a query actually ran
- [x] **AC-3**: The response is never cached, on success **and** failure.
  - **Result**: `Pass`
  - **Evidence**: `Cache-Control: no-store` asserted on the 200; the 503 branch sets the same header
- [x] **AC-4**: No credentials are required.
  - **Result**: `Pass`
  - **Evidence**: the spec's second case issues no `authHeaders(...)` and asserts the status is `200`, not `401`
- [x] **AC-5**: A new route cannot join the app without joining the graph and the trail.
  - **Result**: `Pass`
  - **Evidence**: `contract-graph.test.ts` GRAPH + `route-scope.test.ts` TRAIL_REGISTRY both extended; the latter is a **set-equality** check against `routeFilesOnDisk()`, so the route file failing to appear in the registry fails first
- [x] **AC-6**: The failure path answers 503 rather than a redacted 500.
  - **Result**: `Pass` (implemented) — **with a named gap in coverage**, see §6
  - **Evidence**: `appErrorResponse(serviceUnavailableError(), { 'Cache-Control': 'no-store' })` wraps `getDb()`, which also throws when `DATABASE_URL` is absent
- [x] **AC-7**: Existing gates still pass.
  - **Result**: `Pass`
  - **Evidence**: §6's gate table

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `disabled` — the behavioral control is the watched red recorded in §6
- **Batch Authorization**: `N/A`
- **Soft Checkpoint**: `N/A` — the card completed inside one session
- **Hard Checkpoint**: `N/A` — same reason
- **Event-Driven Checkpoints**: scope expansion, blocker, handoff
- **Stop Conditions**: failed gate, unexpected scope growth, developer stop
- **Host Timer Capability**: `POLICY_LIMITATION` — turn counts are observable, wall-clock is not; no mechanical enforcement claimed

## 5. State and Active Ownership

- **Execution State**: `awaiting_review`
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-09-21 13:50 UTC`
- **Current Actor**: Agent (Freebuff/Buffy)
- **Next Action**: owner reviews and decides whether to commit; on commit the card moves to `completed`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `planned` | `in_progress` | `2026-09-21 13:50 UTC` | Agent | owner selected "hold the tag; implement `/api/health` (B3)" | this session |
| `in_progress` | `awaiting_review` | `2026-09-21 14:05 UTC` | Agent | all gates green on disk | §6 gate table |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `lib/contracts/health.ts` — new; `HealthDbSchema` / `HealthResponseDataSchema` / `HealthResponseSchema`, both objects `.strict()`
  - `src/app/api/health/route.ts` — new; `export const GET = loggedRoute(handleGet)`, `SELECT 1` ping, `no-store` on both 200 and 503
  - `tests/integration/api/health.test.ts` — new; 3 cases (envelope + ping, no credentials, no-store)
  - `tests/unit/api/contract-graph.test.ts` — GRAPH entry `{ health, envelope }` / `['GET']`
  - `tests/unit/api/route-scope.test.ts` — TRAIL_REGISTRY entry `['GET']`
  - `docs/releases/2026-09-21-v1.0.0-release-readiness.md` — B3 closed, probe table updated
  - `docs/STATE.md` — §3 surface + §7 item 47 + §8 row
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`
- **Verification Evidence**:

  | Gate | Command | Result |
  | :--- | :--- | :--- |
  | **Watched RED** | `vitest run tests/integration/api/health.test.ts` (route absent) | **3 failed / 3** — `404`, and `Cache-Control: no-cache, must-revalidate` instead of `no-store`, i.e. Next's own 404 |
  | Green | same command, route present | **3 passed / 3** |
  | typecheck | `npm run typecheck` | exit **0** |
  | lint | `npm run lint` | exit **0** (`--max-warnings=0`) |
  | unit | `npm test` | **65 files / 628 tests** (was 626: the two new `it.each` registry rows) |
  | api | `npm run test:api` | **14 files / 84 tests** (was 13/81 — exactly this spec's 3 cases); preflight green |
  | e2e | `npm run test:e2e -- --workers=1` | **81 passed (6.0 m)**; `G-M3-3` median 4413 ms / p95 **4505 ms** — inside the 5 s budget |

- **Behavior IDs**: `N/A - TDD Enforcement Mode disabled`
- **TDD Intent Register**: `N/A - TDD Enforcement Mode disabled`
- **TDD Execution Evidence**: `N/A - TDD Enforcement Mode disabled`
- **TDD Exception Verification**: `N/A - Code Work`
- **CI Evidence**: not yet — this card has not been pushed; local gates above are the evidence of record
- **Review Evidence**: `N/A` — awaiting owner review
- **Commit Evidence**: `N/A before commit`
- **Pull Request Evidence**: `N/A`
- **Release Evidence**: closes **B3** in `docs/releases/2026-09-21-v1.0.0-release-readiness.md`
- **Blocker and Resume Condition**: `None` for the card. Two **named residuals** travel with it:
  1. **The 503 branch has no executed control.** Forcing it needs a second server boot against an
     unreachable database, and the API harness shares one `next dev` per suite. The branch is
     implemented and reasoned about; it is **not** proven by a failing test, and no part of this
     record claims otherwise. A follow-up could add a dedicated boot with a bad DSN.
  2. **The probe pays a GoTrue auth hop.** `src/middleware.ts` refreshes the session for every
     matched path, so `/api/health` costs one Supabase Auth round trip per probe and will report
     `200` even when Auth itself is down — the ping only covers the database. Folding health out of
     the matcher would save that hop but skip the CSP seam, which is why it was not done here.

- **Completion State**: `awaiting_review`
- **Acceptance Results**: `AC-1 Pass; AC-2 Pass; AC-3 Pass; AC-4 Pass; AC-5 Pass; AC-6 Pass (coverage gap named); AC-7 Pass`
- **Changed-File Summary**: one contract, one route, one spec, two registry rows, two docs —
  **no schema, migration, auth, or existing-route change**
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Pending` — awaiting owner commit decision
