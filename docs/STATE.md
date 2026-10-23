# Project State & Living Execution Tracker

> **This is the projection; history lives in [`STATE-ARCHIVE.md`](STATE-ARCHIVE.md).**
> Compacted 2026-10-23 (`pk:checkpoint` 03) so the file can be read in one pass. Dated
> narratives, completed task breakdowns, closed blockers and the full session log moved there
> verbatim. Older references to "§7 item N", "§8 row" or an earlier "§1 bullet" resolve there.
> Append new history to the archive; rewrite this file to describe *now*.

## 1. Executive Summary & Current Position

- **Project Name**: PPL Fitness Tracker
- **Current Milestone / Epic**: **M4: Hardening, Telemetry & Decommission — IN PROGRESS.**
  Milestone #4 reads **open=13 / closed=29** of 42 (`gh api
  repos/lowqualityloey/ppl-fitness-tracker/milestones/4`, re-read 2026-10-23). M3 is closed at
  19/19; M1 and M2 are complete except the deferred #16.
- **Overall Status**: ACTIVE
- **Target Release**: **v1.0.0 — not released; no tag exists.** Readiness record:
  `docs/releases/2026-09-21-v1.0.0-release-readiness.md`.
- **Last Updated**: 2026-10-23 (`pk:checkpoint` 03 — release evidence reconciled with the green
  `e595ec1` build).
- **Release position**: **candidate verified, product unshippable.** CI run `39653434183` is
  `completed/success` on `e595ec1`; **B1 (#176)** and **B2 (#16)** are open and the tag is held
  (**B8**). Production has run `e595ec1` since `2026-10-21T18:32:16Z`.

- **Current Working Branch — 2026-10-23, `pk:checkpoint` 03 (supersedes every bullet above for "where am I now")**: no product branch is active; this worktree is `freebuff/digest-and-explain-repository-…` at **`e595ec1`**, exactly level with `origin/main` (`git rev-list --left-right --count` → **0 0**). **CI has recovered.** The Oct 22 Next security patch produced run **`39653434183`** — `completed/success`, **17 steps**, `2026-10-21T18:31:06Z` → `18:47:31Z` (**16m25s**) — and it is the **only** run after 2026-09-21, i.e. the first arbitration in ~30 days; **`e595ec1` is now the last CI-verified-green revision**, and Production deployed it at `2026-10-21T18:32:16Z` (`vercel[bot]`). **Milestone #4 re-read: open=13 / closed=29** of 42; **15 open issues**, **0 open PRs**, **0 tags**. The seven `scripts/**.sh` entries in `git status` are **mode-only Git-for-Windows artifacts**, not lost exec bits — `./scripts/check-set-config.sh` exits 0, `ls -l` shows `-rwxr-xr-x`, and the index holds `100755`; **do not stage them**. **The release record is reconciled** (§0 latest deployment, §1 CI row, `Commit SHA`, the tag block and a new Reconciliation Log): candidate `e595ec1`, CI green, and **B1 (#176) + B2 (#16) + the human tag decision** are the only gates left. **No local gate was run this session** — `node_modules` is absent — so CI is the only arbiter claimed. `.promptkit` was initialised this session at `2340251` (v1.8.0-15) and is clean.

- **Superseded position narratives** — the M3-era milestone paragraph, the five dated "what
  does not exist" corrections and the earlier branch log →
  [`STATE-ARCHIVE.md#s1`](STATE-ARCHIVE.md#s1).

> **Do not pin `main`'s SHA as the current state.** Describe the state and name the revision it
> was measured at; a pinned SHA rots on the next merge. Name the source of any board number:
> REST counts milestone-tagged PRs as closed issues, GraphQL counts only issues, and
> `gh issue list --milestone` matches **titles** and can return an empty list that looks clean.

## 2. Milestone & Task Progress

### Milestone Roadmap

- [x] **Planning**: Spec written, six decisions resolved, ADRs recorded (Complete — 2026-09-08)
- [x] **M0**: De-risk spike — RLS enforcement proven through Drizzle (Complete — 2026-09-08, **gate lifted**)
- [/] **M1**: Contracts & Seams — code, contracts, seeds, RLS, auth, and RED baseline complete; production SMTP/delivery remains deferred under issue #16
- [x] **M2**: Core Domain Engine — issues #36–#42 all merged (PRs #43–#47, #51, #53). **Complete 2026-09-11.**
- [x] **M3**: Presentation — **Complete 2026-09-12.** Milestone #3 is **open=0 / closed=19**. M3-00…M3-09 merged 2026-09-11 as PRs #69, #71, #72, #74, #75, #79, #81, #83, #85; **#67 (M3-10, the verification gate) merged as PR #86 (`8704c19`, 2026-09-11T19:23Z)**, and the milestone's last open child, **#73 (`SessionStateSchema`), merged as PR #87 (`2d5edfb`, 2026-09-12T02:00Z)** — so the milestone closed with nothing parked under it. The gate's own verdict: seven goals measured, two documented misses kept rather than relabelled, and every gate in the suite watched to fail (audit entries 9–19).
- [/] **M4**: Hardening, telemetry, decommission the legacy static app — **IN PROGRESS.** Board **open=13 / closed=29 of 42** (`gh api …/milestones/4`, 2026-10-23). The three release blockers became **#174** (startup env, B4), **#175** (production seed, B5) and **#176** (Deployment Protection, B1, `p0`); #175 and #178 are closed, **#16 remains owner-blocked**, and the **#164 chain is closed end-to-end** (spike #166 → slices #169/#172). Cards: `docs/tasks/m4/`; handoff: `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`.

- **Detailed task breakdowns** — the M0/M1/M2/M3 checklists, the M2 checkpoint and the M1
  implementation notes → [`STATE-ARCHIVE.md#s2`](STATE-ARCHIVE.md#s2). Live M4 cards:
  `docs/tasks/m4/`.

## 3. Active Working Set

- **2026-10-23 (checkpoint 03)**: no product slice is active. The working set is documentation: `docs/releases/2026-09-21-v1.0.0-release-readiness.md`, `docs/releases/ci-triage/CI-github-35555062183.md`, `docs/tasks/m4/M4-29-first-release.checkpoint-03.md`, and this file. Nothing is in flight and no executable file changed.
- **Target Workspace / Package**: N/A (standalone repo)
- **Active RFC / Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md`
- **Active Task Spec**: `docs/specs/2026-09-11-spec-m3-presentation.md` (M3 — grilled, §8 amendments binding; §8.7 added by the #57 implementation), decomposed into `docs/tasks/m3/README.md` with eleven slice cards `M3-00`…`M3-10` published as issues #57–#67 under milestone #3. **#57–#67 are all merged (PRs #69–#86) and the milestone's extra child #73 merged as PR #87: M3 is complete, open=0 / closed=19.** There is no active M3 spec; **the next spec to write is M4's**, from `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md`. The completed M2 record is `docs/specs/2026-09-08-m2-core-domain-engine.md` with `docs/tasks/m2/`.

- **Historical surface notes** — M2/M3/M4 slice internals, verification baselines and retired
  legacy pointers → [`STATE-ARCHIVE.md#s3`](STATE-ARCHIVE.md#s3). Executable commands:
  `PROMPTKIT.md` §3.

## 4. Locked Technical Invariants (Do Not Undo)

Derived from ADR-0001…0006. Changing any of these means superseding the ADR, not editing code.

> Items 3–6 and 13–16 were **verified empirically** by the M0 spike on 2026-09-08, not merely decided. Evidence: `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`.

1. **Next.js 16 + React 19 + TypeScript strict.** Node ≥ 20.9. (ADR-0001)
2. **Supabase Auth owns identity.** `profiles.id` *is* `auth.users.id`; every domain FK points at `profiles.id`. No mirror table, no identity-sync webhook. (ADR-0002) *Since #89 the identity link is also physical: migration `0007` adds `profiles_id_auth_users_fkey` → `auth.users(id)` `ON DELETE CASCADE`, executed — not trusted — by `tests/integration/auth-user-cascade.test.ts` on both deletion paths.*
3. **Two authorization layers.** App-layer `userId` scoping is authoritative; Postgres RLS under the non-owner `app_authenticated` role is the backstop. Both ship. (ADR-0003)
4. **`set_config('request.jwt.claims', …, true)`** — the `is_local` flag is mandatory. Omitting it leaks identity across pooled connections. **Reproduced in M0**, not theoretical: with `false`, the next claim-less query on the same backend read the previous user's row.
5. **Repository methods take `userId` first.** No unscoped query helper may exist. (ADR-0003)
6. **Every table carries RLS**, four discrete policies, never `FOR ALL`, enforced by a `pg_tables` drift test. (ADR-0003)
7. **Focus ring is 2px `#465fff`**, not the `#ecf3ff` that `DESIGN.md` specifies — the latter measures ~1.1:1 and fails WCAG 2.2 SC 1.4.11. (ADR-0004)
8. **Kilograms canonical in storage**, display unit is a per-profile preference, conversion at the display boundary only. (ADR-0005)
9. **Primary blue is the CTA colour on every route**, regardless of day. Day accents are confined to badge and card border. (ADR-0005)
10. **Timers store absolute `endsAt`**, never decrementing counters. (Spec §3)
11. **A security control does not exist until a merge-gating test proves it runs.** (PROMPTKIT.md §6)
12. **Schema changes follow Expand → Backfill/Read-Switch → Contract** from M1 onward. (Spec §4.6)

Added by the M0 spike (ADR-0003 Amendment A1):

13. **`withUser` sets two GUCs, not one.** Blank `request.jwt.claim.sub` transaction-locally *before* seeding `request.jwt.claims`. `auth.uid()` checks the legacy singular GUC first, so a stale session-scoped value silently outranks the claims you set — demonstrated reading another user's row while correctly authenticated. (A1.1)
14. **The app role gets nothing on the `auth` schema.** Policies resolve `auth.uid()` fine without it. Therefore application code never calls `auth.uid()` directly — the user id comes from `requireUser()`, and diagnostics read the GUC wrapped in `nullif(…, '')`. (A1.2)
15. **`FORCE ROW LEVEL SECURITY` does not stop the owner.** It removes the ownership exemption, not the `BYPASSRLS` attribute, and Supabase's `postgres` has that attribute. The `current_user` assertion in the tenancy gate is the only thing preventing a vacuous pass. (A1.3)
16. **Every security control ships with an exercised failure mode.** Not just a test that passes — a negative control that fails when the mitigation is removed. The `is_local` invariant sat unexercised through planning; M0 added the leaky variant to prove the mitigation does something.
17. **Assert the result of any `GRANT` against a Supabase-managed schema.** `GRANT USAGE ON SCHEMA auth` as `postgres` returns success and changes nothing. Exit codes are not evidence there. (A1.2)
18. **Runtime request-path database code uses `DATABASE_URL` only.** `MIGRATION_DATABASE_URL` is owner-only for migrations, seeds, metadata, and bounded test fixture setup; it must never be imported by runtime repositories or route handlers.
19. **Verified auth context binds claims to the explicit repository user.** `requireUserContext()` derives claims from Supabase `auth.getUser()`, and repository methods assert `claims.sub === userId` before entering `withUser()`.
20. **M2 repository methods keep `userId` first and map rows at the domain boundary.** Route handlers must not expose raw Drizzle rows or bypass `WorkoutRepository` for user data.

21. **`since` is compared to `workout_sessions.server_seq` and nothing else, and `since >` current seq returns the FULL session.** Equality is the only "no change" answer; a client claiming to be ahead of the server is wrong about something, and "no change" would let it keep trusting state that never existed. `updated_at` and client clocks are never version tokens. *(M3-01 #58, locked in `lib/contracts/sessions.ts`, 2026-09-11.)*
22. **`WeightKgSchema` and `RepsSchema` live in `lib/contracts/common.ts`; `sync.ts` re-exports them and `sessions.ts` must never import from `sync.ts`.** Written when `sync.ts` imported `SessionStateSchema` from `sessions.ts`, so the reverse import closed a cycle at module scope — failure mode an `undefined` at import time or a schema that quietly stops validating. **#105 deleted that import** (a sync response no longer carries a session graph), so the cycle hazard is gone; **the rule is kept regardless**, because what it actually protects is single ownership of the scalar bounds — `sync.ts` and `sessions.ts` both need `WeightKgSchema`, and a bound declared twice is two sources of truth that can disagree in silence. The invariant is unchanged; only its original justification is superseded, and `lib/contracts/common.ts` says so where the schemas live. *(Found while writing M3-00 on 2026-09-11; the bounds also mirror the `weight_sane`/`reps_sane` CHECK constraints so schema and database rejections stay one event.)*
23. **`PATCH /api/profile` accepts only `displayName` and `preferredUnit`, and an unknown key is a 400, not an ignored field.** `email` is not client-editable at all: identity belongs to Supabase Auth and the app has no verification flow to back the claim. *(M3-00 #57.)*
24. **The `preferredUnit` wire value is literally the DB enum: `('kg', 'lbs')`, not `('kg', 'lb')`.** Verified against `db/schema/index.ts:29`, migration `0000:5`, and a live `pg_type ⋈ pg_enum` query. No mapping layer, no `ALTER TYPE`: `"lb"` is a 400 pinned in unit and route specs (the RFC §4.1 snippet that guessed it is corrected by the spec's §8.7 erratum). A contract comment claiming to *mirror* storage is an unverified claim until a test reads the storage truth. *(M3-00 #57, 2026-09-11.)*
25. **Migrations are hand-authored SQL in `supabase/migrations/`, applied in filename order by the Supabase CLI; drizzle-kit `generate`/`migrate` stay out of the migration loop.** The npm scripts are gone, `drizzle.config.ts` declares no `out:`, and `supabase/migrations/meta/` is deleted — each leg enforced by `tests/unit/migration-authority.test.ts`, which was watched failing on all four injected re-introductions (M4 audit entries 4–5). `db/schema/index.ts` is a runtime type view, not a codegen source: keep it in step with the SQL by hand and prove column-level truth with live-catalog tests. *(M4-00 #89, ADR-0006, 2026-09-12.)*

---

## 5. Known Blockers, Risks & Open Questions

### Live blockers (release-relevant)

| ID | Blocker | Card | Owner | Status |
| :--- | :--- | :--- | :--- | :--- |
| **B1** | Production alias is behind Vercel Deployment Protection — every path `302`s to SSO | #176 (p0) | Owner | **OPEN** |
| **B2** | No production SMTP — the magic link cannot be delivered, so sign-in cannot complete | #16 (p0) | Owner | **OPEN** — accepted for this release by the 2026-09-21 scope decision |
| **B8** | `v1.0.0` tag uncreated | — | Owner | **OPEN** — human-only; no workflow creates it |
| — | Production verification of #177 | #177 | Owner | **OPEN on purpose** — acceptance needs a production `200`, which B1 blocks |

**Closed/resolved:** B3 (health probe), B4 (startup env validation), B5 (production seed),
B6 (Vercel env), B7 (hosted project) and the CI billing condition. Their as-found narratives,
including the two owner claims later measured false, are preserved in
[`STATE-ARCHIVE.md#s5`](STATE-ARCHIVE.md#s5).

### Open findings (filed, not release blockers)

- **#76** — no API path produces an `archived` session, so #63's scenario is not testable end-to-end.
- **#77** — sync rejections carry only a reason code; the client cannot explain a refusal.
- **#78** — same-millisecond writes to one entity are ordered by a random UUID rather than arrival.

### Technical debt still open

- **D2** — `tests/unit/with-user.test.ts` is an integration test sitting in the unit layer.
- **D6** — running the API suite rewrites the tracked `tsconfig.json`.
- **D7** — integration suites read query results through inferred `any`.
- Cards: `docs/tasks/2026-09-11-intake-debt-index.md`. Full risk narratives:
  [`STATE-ARCHIVE.md#s5`](STATE-ARCHIVE.md#s5).

## 6. Recent Architectural Decisions (ADR Log)

| Date | Title & Scope | Decision Summary | ADR File |
| :--- | :--- | :--- | :--- |
| 2026-09-08 | Framework version | Next.js 16 + React 19 + TS strict. Requested "Next.js 14 + React 19" is not a valid pair — React 19 stabilised in Next 15, and 14 is EOL. | `docs/adrs/0001-nextjs-16-react-19.md` |
| 2026-09-08 | Auth provider | Supabase Auth, replacing the originally requested Clerk. Removes a vendor, the identity-sync webhook, the mirror table, and the custom RLS resolver function. | `docs/adrs/0002-supabase-auth-over-clerk.md` |
| 2026-09-08 | Authorization model | Both layers. App scoping authoritative, RLS under a `NOBYPASSRLS` non-owner role as backstop. **Confirmed empirically by M0 and amended (A1)**: `withUser` needs a second `set_config`, the app role gets nothing on the `auth` schema, `FORCE` does not stop the owner, role attributes cannot be re-forced by migration, and the cost is now measured. Decision unchanged. | `docs/adrs/0003-rls-defense-in-depth.md` |
| 2026-09-08 | Focus ring contrast | Override `DESIGN.md`. 2px `#465fff` (~4.8:1) replaces `#ecf3ff` (~1.1:1), which fails SC 1.4.11. | `docs/adrs/0004-focus-ring-contrast-override.md` |
| 2026-09-08 | Design tokens + set logging | One base palette plus three scoped day accents; light-only v1. Weight and reps in scope, nullable, prefilled from last session, kg canonical. | `docs/adrs/0005-design-tokens-and-set-logging.md` |
| 2026-09-12 | Migration authorship (D4) + auth-FK cascade | **Hand-authored SQL is the only migration currency**, applied by the Supabase CLI in filename order; drizzle-kit `generate`/`migrate` retired (scripts, `out:`, journal all deleted) after the stale-snapshot phantom migration was *watched* emitting destructive DDL with exit 0. Same card made identity deletion physical: `0007` adds `profiles.id → auth.users.id ON DELETE CASCADE`, executed by `auth-user-cascade.test.ts` and carried by `test:mutation`. | `docs/adrs/0006-migration-authorship-hand-authored.md` |
| 2026-09-16 | Cross-device propagation posture (M4-23/#112) | **The 4 s poll floor is the ratified mechanism; Supabase Realtime is declined for margin, not ignored.** The RLS widening was costed (first browser-readable application-table policy; today zero `authenticated` policies exist) and declined; §8.3's limiter arithmetic (120 req/min, polls ≤40 %) excludes a shorter poll. Monitoring is the existing instrument — G-M3-3's printed distribution on every CI battery — with four named revisit triggers, and the card's AC-2 tenancy-gate rule stands as a permanent precondition for any future Realtime PR. `G_M3_3_BUDGET_MS` untouched. | `docs/adrs/0007-realtime-declined-poll-floor-accepted.md` |

---

## 7. Next Immediate Actions (Queued)

1. **Owner records the B1 decision on #176** — lift Deployment Protection for the production
   alias, or keep it and label the release explicitly non-public. This gates the release's
   public face.
2. **Then B2 (#16)** — production SMTP gates sign-in. Without it the release is non-functional
   for end users, which the 2026-09-21 decision already states.
3. **Then the tag** — `v1.0.0` at `e595ec1`, only after explicit owner approval (B8). No
   workflow creates it; `git tag -l` is empty.

> **Archive:** items 1–22 are preserved verbatim in
> [`STATE-ARCHIVE.md#s7`](STATE-ARCHIVE.md#s7); items 23–57 are in
> [`STATE-ARCHIVE.md#s8`](STATE-ARCHIVE.md#s8), where the original file physically placed them.
> Anchors are `#item-1` … `#item-57`; the archive keeps that anomaly visible instead of
> renumbering history.

## 8. Session Continuity Log

| Date | Engineer / Agent | Milestone / Focus | Key Changes & Artifacts |
| :--- | :--- | :--- | :--- |
| 2026-09-21 | Agent (Freebuff/Buffy) | **`B7`/`B6`/`B5` all closed in one pass — hosted project created, app boots against it, seed content verified (18/13), and the release's remaining gate is now B1** | Asked to pick an alternative to Supabase, the answer was **stay**, with the evidence counted rather than argued: **56 `CREATE POLICY` statements, 98 `auth.uid()` references**, a `handle_new_user` trigger on **`auth.users`**, FKs from `profiles.id`/`workout_sessions.user_id` into it, and GoTrue magic-link as the **only** sign-in — so Neon meant replacing auth and rewriting every policy, and Turso (SQLite) has no Postgres RLS at all. The binding constraint was the free-plan cap, which Supabase's docs confirm applies **across all organizations** where you are an Owner/Administrator, so a second org would not have helped; **`shelf` was paused** (reversible) on the owner's instruction. Provisioned **`ppl-fitness-tracker`** (`kkzzwzzkysyvvzgifymk`, `ap-southeast-2`): **9 migrations** via `supabase db push --db-url`, verified **13 public tables · 52 RLS policies · 9 recorded migrations**, `app_authenticated` with `rolbypassrls=false`, and seeds (`18 exercises / 3 routine days`, `13 stretches / 15 placements`). **The committed password literal from migration 0001 was rotated immediately** to a generated 48-char password never printed. **B5 CLOSED — PASS**: the hosted project returns **18 strength + 13 stretch slugs, 31 distinct slugs, routine_days 3, routine_exercises 33**, and critically **the owner role and the app role (RLS applied) returned identical counts**, proving system content is readable through RLS without a session — had they differed, the app would have shown an empty list while the owner read looked fine. **B6 CONFIGURED**: four Production variables (DATABASE_URL as Secret) plus a redeploy (`ppl-fitness-tracker-pvkrp0ea8`, `● Ready`); the boot is **proven by an equivalent test, not the card's test** — local boot with exactly those values gave `✓ Ready in 397ms`, no `refusing to start`, and `GET /api/health` → **200** `latencyMs 36.3` against the hosted DB — so **#177 stays open** because a 200 from the production URL is still blocked by B1. Four traps recorded (IPv6-only direct connections; `vercel env add` silently refuses a private-looking `NEXT_PUBLIC_` value without `--type config`; `vercel redeploy` rejects `--yes`; `</dev/null` overrides a pipe). Two self-inflicted errors were caught and corrected in place: an unpersisted first DB password (reset via the API) and a wrong ref typed into the #178 comment. **#175 and #178 CLOSED, #177 open on purpose**; M4 now **open=13 / closed=29**. No secret appears anywhere — four generated passwords live only in the gitignored `.env.local` and in Vercel. §7 item 56 carries the detail. |
| 2026-09-21 | Agent (Freebuff/Buffy) | **Local gate run on `89418d5` — the only arbitration available while CI cannot start** | **Why:** a fourth run (**`35560988807`**, on the pushed head `89418d5`) failed with **`steps: 0`** in 2 s on the same account-billing annotation, so **no runner can execute a step** — and it **falsified a plan I had given the owner twice**: pushing *delivers* commits, it does not *arbitrate* them, while the condition holds. **What ran** (the workflow's own five stages, on this workstation, against the **local** stack): lint 0 · typecheck 0 · `set_config` ban 0 · preflight 4/4 (`app_authenticated`, `BYPASSRLS=false`, password aligned, GoTrue 200) · `npm test` **66 files / 638 tests pass** in 33.4 s · `npm run test:api` **14 files / 84 tests pass** in 187.6 s · `npm run build` green (5.4 s, 15/15 static pages) · e2e **81 passed in 4.2 m, 0 skipped / 0 flaky**, with `legacy-parity.spec.ts` **executing** rather than skipping, and every M3 SLA inside budget (G-M3-4 508 ms vs 5 000 ms; sync p95 326.9 ms; G-M3-3 p95 4 658 ms). **Record:** `docs/releases/ci-triage/gate-local-89418d5.md`. **Explicitly not claimed:** this is **not CI arbitration** and **not production truth** — it ran against the local stack, turns no red run green, and does not move the tag decision. **Three findings, one of them mine:** (i) `npm run test:e2e` does **not** load `.env.local` while every other suite does, so the first attempt failed as an *environment* error wearing a test-failure shape — re-invoked via `node --env-file-if-exists=.env.local node_modules/@playwright/test/cli.js test`; **local-only** (CI supplies these from the job-level `env:` block), **open, unfiled**; (ii) every build restamps the **tracked** `public/sw.js` (version = `sha256(.next/BUILD_ID)`, and the build id is per-build random), so a clean tree and a local green gate cannot coexist — restored with `git checkout -- public/sw.js`; (iii) my own `pkill -f 'next start --port 3001'` matched the invoking shell's command line and killed it mid-command, truncating one check's output — re-run separately, server confirmed stopped. **Nothing pushed, nothing tagged, no production action; the only blocking item remains the owner's GitHub billing fix.** |
| 2026-10-23 | Agent (Freebuff/Buffy) | **`pk:checkpoint` 03 — release evidence reconciled with the green `e595ec1` build (CI recovered after ~30 days)** | The repository digest + `pk:route` pass found both live records still describing the 2026-09-21 billing outage. **Measured this turn:** `HEAD == origin/main == e595ec1` (0/0); run **`39653434183`** `completed/success`, **17 steps, 16m25s**, the **only** run after 2026-09-21; Production on `e595ec1` since `2026-10-21T18:32:16Z`; M4 **open=13 / closed=29**; 15 open issues, 0 open PRs, 0 tags. **Updated:** release record (`Commit SHA`, §0 deployment row, §1 CI row, tag block, new Reconciliation Log), CI triage record (`verified`), and this file (§1 bullet, §2 board, §5 live set, §7 item 57). **Deliberately unchanged:** `Release Linkage State` `blocked`, `Verified Result` `Pending`, tag uncreated, **B1 #176 / B2 #16** open. **Correction recorded:** the seven `scripts/` mode diffs are a Git-for-Windows artifact, not lost exec bits (`./scripts/check-set-config.sh` exit 0; index `100755`); never stage them. No local gate ran (`node_modules` absent) and no remote write occurred. |

- **Full log** — 108 rows from 2026-09-08 to 2026-10-23 →
  [`STATE-ARCHIVE.md#s8`](STATE-ARCHIVE.md#s8).

## 9. Session Spend Ledger

The durable spend artifact required by `checkpoint.md`. Per-turn card figures stay in chat history; this
ledger is the only place they persist. **Created 2026-09-21** — this repository's earlier checkpoints
predate the ledger requirement, and **no earlier row was reconstructed**: fabricating turn counts for
sessions nobody measured would make the ledger worse than empty. Measured spend is recorded as
`not measured` where the host exposes no token accounting, rather than estimated and presented as fact.

| Date (focus) | Turns | Measured in/out | ~Estimated payload | Host usage source or why not measured |
| :--- | :--- | :--- | :--- | :--- |
| 2026-09-21 (**one continuous session**, two checkpoints: M4-28 slice B → post-merge sync → `pk:ship` → M4-30 → `pk:issue` → M4-31 → CI triage → **executed CI re-run** → M4-32/B5 → **B6 discovery + #177** → `pk:checkpoint` 02) | `~45 (estimate, not measured)` | `not measured` | large — 12+ workflow passes, 3 code cards, 1 release record, 1 CI triage record, 1 executed remote action, 2 checkpoints, 1 new `p0` card | The host exposes no token accounting to the agent, so the honest value is `not measured`; the turn value is labelled an estimate because it is one. The row was **extended rather than duplicated** when checkpoint 02 was taken, because both checkpoints bound the same session — a second row would inflate the session count |

| 2026-10-23 (digest → `pk:route` → `pk:checkpoint` 03) | `~8 (estimate, not measured)` | `not measured` | small — repository digest, route decision, 3 docs reconciled, 1 checkpoint record | The host exposes no token accounting to the agent, so the honest value is `not measured`; the turn figure is labelled an estimate because it is one. |

**Running total**: 2 sessions recorded (holding **3 checkpoints**, 01–03) · measured spend `not measured`
for all recorded sessions · the estimate column is present but explicitly an estimate, never a substitute for
a measurement. No row was reconstructed for any earlier session, and none was duplicated for the second
checkpoint of this one.
