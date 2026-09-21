# Local gate run — `89418d5`

**Date**: 2026-09-21 · **Revision**: `89418d5` (the pushed head of `main`) · **Workstation**, not a runner.

## Why this exists

CI cannot start. Run `35560988807` on this exact revision failed with **`steps: 0`** —
*"The job was not started because recent account payments have failed…"* (see
`CI-github-35555062183.md`, occurrence 4). Four runs, two triggers (push and re-run), zero steps.
The account condition is an **owner** action, so this run is the **only arbitration available** in
the meantime.

## What is claimed, and what is not

| | |
| :--- | :--- |
| **Claimed** | The five-stage gate in `.github/workflows/test.yml` was executed on `89418d5` on this workstation, with the stages, commands and results below. |
| **NOT claimed** | **This is not CI arbitration.** No GitHub runner executed anything. It does not turn the four red runs green, and it is **not** evidence about the hosted production deployment. |
| **Environment** | `node v24.20.0` (matches the workflow's `node-version: 24`), npm, local Supabase stack in Docker (8 containers healthy, started 13 h before this run). |
| **Database** | The **local** stack (`127.0.0.1:54322` direct / `:54329` pooler) — **not** the hosted project `kkzzwzzkysyvvzgifymk`. |

## Stage-by-stage

| # | Stage (workflow step) | Command | Exit | Result |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Lint | `npm run lint` | **0** | `eslint --max-warnings=0 .` — clean, zero warnings |
| 2 | Type check | `npm run typecheck` | **0** | `next typegen && tsc --noEmit` — types generated, no errors |
| 3 | Ban direct `set_config` | `./scripts/check-set-config.sh` | **0** | *"No banned set_config calls found"* |
| 4 | Preflight integration environment | `npm run test:api:preflight` | **0** | 4/4 checks `ok` ↓ |
| 5 | Test suite (incl. schema drift) | `npm test` | **0** | **66 files / 638 tests passed**, 33.40 s |
| 6 | API route-handler suites | `npm run test:api` | **0** | **14 files / 84 tests passed**, 187.55 s |
| 7 | Production build + E2E | `npm run build`, then Playwright (see F1) | **0** | build compiled in 5.4 s; **81 e2e passed**, 4.2 min |

Preflight output (verbatim, stage 4):

```
ok    owner connection (direct 54322) — connected as postgres, 13 public tables
ok    app-role connection (DATABASE_URL) — connected as app_authenticated, BYPASSRLS=false
ok    app-role password matches the migration literal — aligned (f6ac9784a373)
ok    GoTrue reachable — http://127.0.0.1:54321 is serving (status 200)
```

Build output (stage 7): `✓ Compiled successfully in 5.4s` · 15/15 static pages generated ·
`[sw-manifest] version …: 21 precache URLs, sw.js stamped.`

## Browser-gate measurements (production build, local stack)

These are the numbers the SLA specs enforce. Quoted from this run, not from prior records:

| Gate | Measured this run | Budget | Verdict |
| :--- | :--- | :--- | :--- |
| G-M3-4 — 60-mutation queue drains after reconnect | median **508.3 ms** | 5 000 ms | PASS (1 `/api/sync` POST, single batch) |
| G-M3-2 — set-tap to local UI update | issued 100, measured **102** | < 50 ms | PASS |
| G-M3-3 — cross-device propagation | median 4 445.0 ms, **p95 4 658.0 ms** | 5 000 ms p95 | PASS |
| POST `/api/sync`, 50 sequential | p50 **190.2 ms**, p95 **326.9 ms**, max 350.7 ms | 800 ms ceiling | inside |
| GET `/api/exercises`, 30 sequential | p50 **11.1 ms**, p95 **21.6 ms** | 800 ms ceiling | inside |
| `/api/health` on the local production build | **200** `{"db":{"ok":true,"latencyMs":2.4}}` | — | ok |

**Zero skipped, zero flaky** — checked explicitly, because a *silently skipped* parity gate is an
unwatched claim. `legacy-parity.spec.ts` **executed** (3 tests), including its "a reappearing file
is red" guard.

## Findings from this run

**F1 — `npm run test:e2e` cannot load `.env.local`, while every other suite can.**
`npm test` and `npm run test:api` invoke vitest as
`node --env-file-if-exists=.env.local …`, but the Playwright entry point does not, so the first
attempt died in fixture setup with
*"API integration suites need a running Supabase stack and its credentials"* — an **environment**
failure wearing a test-failure shape. Re-invoked as:

```bash
node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test
```

This is **local-only**: CI supplies these variables from the workflow's job-level `env:` block, so
the runner never hits it. Status: **open, unreported** — offered as a card rather than filed
unilaterally.

**F2 — any build dirties the tracked `public/sw.js`.**
`BUILD_VERSION` is `sha256(.next/BUILD_ID)`, and Next's build id is generated **per build**, so the
stamp changes on every build (this run produced a third distinct value; the committed one is from
`491fb1a`). That is **by design** — the changed bytes are the hand-written worker's only update
trigger — but it means a *clean tree* and a *local green gate* cannot coexist. Restored afterwards
with `git checkout -- public/sw.js`; the tree is clean again.

**F3 — a self-inflicted one, disclosed.** `pkill -f 'next start --port 3001'` matched the invoking
shell's own command line and killed it mid-command, truncating that check's output. Re-run
separately; the background server is confirmed stopped (port `3001` → `000`, no stray `next-server`).

## Reproduce

```bash
npm run lint && npm run typecheck && ./scripts/check-set-config.sh
npx supabase start                       # local stack
npm run test:api:preflight && npm test && npm run test:api
npm run build && npm run start &         # :3001, reused by Playwright
node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test
git checkout -- public/sw.js             # F2: the build restamps a tracked file
```
