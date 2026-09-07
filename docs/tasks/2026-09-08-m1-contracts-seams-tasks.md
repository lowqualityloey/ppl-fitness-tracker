# M1 — Contracts & Seams: Task Breakdown

- **Source Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.1–4.7, §5, §6
- **Source ADRs**: `docs/adrs/0001`…`0005`, amendment A1 in `0003-rls-defense-in-depth.md`
- **Source Spike**: `docs/spikes/2026-09-08-drizzle-rls-enforcement.md` (M0, complete, gate lifted)
- **Milestone**: M1 — Contracts & Seams (RED phase of TDD Red-Green-Refactor; M2 turns these green)
- **Generated**: 2026-09-08
- **Status**: **Filed 2026-09-08** as issues [#3–#18](https://github.com/lowqualityloey/ppl-fitness-tracker/milestone/1) under milestone `M1: Contracts & Seams`. This document stays the local source of truth per `pk:tasks` Phase 4 — it survives context compaction and works offline, where the GitHub board does not.

## Why these 16, in this order

M1 is "RED" by design: schema, RLS, auth, and contracts land with failing tests
that M2 makes pass. Every task below is sized to 1–4 hours and touches one
layer. Five tasks (`M1-04`, `M1-06`, `M1-07`, `M1-08`, `M1-11`) exist specifically
*because* of what M0 found — porting the spike's verified patterns is cheaper and
safer than re-deriving them, and skipping that step would silently regress
findings A1.1–A1.5.

```text
#3  M1-01 (scaffold)
 └─ #4  M1-02 (Supabase project + env split)
     ├─ #5  M1-03 (Drizzle schema, all tables)
     │   ├─ #6  M1-04 (app_authenticated role + handle_new_user)
     │   │   ├─ #7  M1-05 (RLS: content tables)
     │   │   ├─ #8  M1-06 (RLS: user-data tables)
     │   │   │   └─ #9  M1-07 (drift test, ported + widened)
     │   │   │       └─ #10 M1-08 (tenancy gate, ported + widened)
     │   │   └─ #13 M1-11 (withUser, two-GUC hardened)
     │   ├─ #11 M1-09 (seed: 18 exercises)
     │   ├─ #12 M1-10 (seed: 13 unique stretches, dual-day association)
     │   └─ #17 M1-15 (Zod contracts) ── independent of RLS track, runs in parallel
     │       └─ #18 M1-16 (failing route-handler tests, RED)
     └─ #14 M1-12 (SSR middleware + requireUser())
         ├─ #15 M1-13 (magic-link sign-in + /auth/confirm)
         │   └─ #16 M1-14 (custom SMTP + synthetic monitor)
         └─ (#18 also depends on #14 for auth-required assertions)
```

`M1-09` and `M1-10` only need the schema (`M1-03`), not RLS — they can run any
time after `M1-03`, in parallel with the auth track. This matches `STATE.md`'s
note that legacy extraction is "spike-independent, parallelisable now."

## Task Table

| ID | Issue | Title | Priority | Area | Depends on | Est. |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| [M1-01](m1/m1-01-nextjs-scaffold.md) | [#3](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/3) | Next.js 16 + React 19 + TS strict scaffold | p0 | infra | — | 2h |
| [M1-02](m1/m1-02-supabase-project-env-split.md) | [#4](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/4) | Supabase local project + `DATABASE_URL`/`MIGRATION_DATABASE_URL` split | p0 | infra | #3 | 2h |
| [M1-03](m1/m1-03-drizzle-schema-all-tables.md) | [#5](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/5) | Drizzle schema for all 9 tables + initial migration | p0 | data | #4 | 4h |
| [M1-04](m1/m1-04-app-authenticated-role-trigger.md) | [#6](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/6) | `app_authenticated` role + `handle_new_user` trigger | p0 | auth | #5 | 3h |
| [M1-05](m1/m1-05-rls-content-tables.md) | [#7](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/7) | RLS: content tables (`exercises`, `routine_days`, `routine_exercises`) | p0 | data | #6 | 2h |
| [M1-06](m1/m1-06-rls-user-data-tables.md) | [#8](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/8) | RLS: user-data tables, 4 policies each, never `FOR ALL` | p0 | data | #6 | 4h |
| [M1-07](m1/m1-07-drift-test-ported.md) | [#9](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/9) | Schema-drift test, ported from spike and widened | p0 | data | #7, #8 | 2h |
| [M1-08](m1/m1-08-tenancy-gate-ported.md) | [#10](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/10) | Tenancy integration gate, ported from spike and widened | p0 | backend | #9 | 3h |
| [M1-09](m1/m1-09-seed-exercises.md) | [#11](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/11) | Seed script: 18 exercises extracted from legacy app | p1 | data | #5 | 3h |
| [M1-10](m1/m1-10-seed-stretches.md) | [#12](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/12) | Seed script: 13 unique stretches, dual-day association resolved | p2 | data | #5 | 2h |
| [M1-11](m1/m1-11-with-user-hardened-helper.md) | [#13](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/13) | `withUser()` repository helper, two-GUC hardened | p0 | backend | #6 | 2h |
| [M1-12](m1/m1-12-ssr-middleware-require-user.md) | [#14](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/14) | Supabase SSR middleware + `requireUser()` | p0 | auth | #4 | 3h |
| [M1-13](m1/m1-13-magic-link-signin-confirm.md) | [#15](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/15) | Magic-link sign-in + `/auth/confirm` with redirect allowlist | p0 | auth | #14 | 3h |
| [M1-14](m1/m1-14-custom-smtp-synthetic-monitor.md) | [#16](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/16) | Custom SMTP provider + hourly synthetic monitor | p0 | auth | #15 | 3h |
| [M1-15](m1/m1-15-zod-contracts.md) | [#17](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/17) | Zod contracts for every route + shared `AppError` envelope | p1 | backend | #5 | 3h |
| [M1-16](m1/m1-16-failing-route-handler-tests.md) | [#18](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/18) | Failing route-handler tests (RED) for all 9 endpoints | p1 | backend | #17, #14 | 4h |

**Total: ~45 hours across 16 issues.** `M1-14` (custom SMTP) is p0 despite being
late in the dependency chain — spec §5 and `STATE.md` both call it a launch
blocker, not polish, so it must not slip to "later."

## Non-negotiable invariants carried into every relevant task

Restated here because they cut across tasks and are easy to lose in a per-issue view:

- Every table gets `ENABLE` + `FORCE ROW LEVEL SECURITY` and exactly four
  policies (SELECT/INSERT/UPDATE/DELETE), never `FOR ALL`. (ADR-0003, `PROMPTKIT.md` §6)
- `withUser` sets **two** GUCs — `request.jwt.claim.sub` blanked, then
  `request.jwt.claims` seeded — both `is_local = true`. One `set_config` call is
  a defect, not a simplification. (ADR-0003 Amendment A1.1)
- The app role (`app_authenticated`) is granted **nothing** on the `auth` schema.
  Application code takes the user id from `requireUser()`, never `auth.uid()`.
  (Amendment A1.2)
- Role attributes (`NOBYPASSRLS`, `NOSUPERUSER`, …) are asserted by test, never
  re-`ALTER`ed by a migration — Postgres refuses the `ALTER` on a Supabase
  project. (Amendment A1.4)
- The tenancy gate's first statement is `current_user = 'app_authenticated'`.
  `FORCE ROW LEVEL SECURITY` does not stop the owner role; only this assertion
  does. (Amendment A1.3)
- Any security control ships with a negative control proving it fails when
  removed — not just a positive test proving it passes. (`PROMPTKIT.md` §6,
  reinforced by the spike's own mutation-check finding)
- Kilograms canonical in storage; weight/rep `check` constraints in the schema,
  not only in Zod. (ADR-0005, spec §4.1)

## What M1 must adopt from `spikes/m0-drizzle-rls/` — traced to tasks

| Spike finding / artifact | Landing task |
| :-- | :-- |
| `withUserHardened()` becomes the only `withUser` | M1-11 |
| No grants on `auth` schema; never call `auth.uid()` from app code | M1-04, M1-11 |
| Drift test ported verbatim, widened to zero-policy + `FOR ALL` | M1-07 |
| `current_user` assertion as the gate's first statement | M1-08 |
| Negative control (`is_local = false` leak demo) kept in the suite | M1-08 |
| Role attributes asserted by test, not migration | M1-04 |
| `GRANT` results against Supabase-managed schemas asserted, not trusted | M1-04 |
| Tenancy gate run against the pooler DSN, not only direct | M1-08 |

## Out of scope for M1 (belongs to M2/M3/M4)

- `SessionEngine`, `SyncEngine` (client half), `ProgressionEngine`, `LegacyImporter` business logic — M2
- Any UI component, shadcn/ui setup, design tokens application — M3
- WCAG audit, offline outbox E2E, load testing, telemetry — M3/M4
- Deleting legacy static pages — M4

---

## GitHub CLI Recipes

Repo: `lowqualityloey/ppl-fitness-tracker` (private). None of these have been run
yet — see the confirmation gate in the session before executing.

```bash
# One-time: labels (skip any that already exist)
gh label create "area:infra"    --color "5319e7" --description "Scaffolding, tooling, CI, environment" --repo lowqualityloey/ppl-fitness-tracker
gh label create "area:data"     --color "0e8a16" --description "Schema, migrations, RLS, seed data"     --repo lowqualityloey/ppl-fitness-tracker
gh label create "area:backend"  --color "1d76db" --description "Route handlers, contracts, repositories" --repo lowqualityloey/ppl-fitness-tracker
gh label create "area:auth"     --color "b60205" --description "Supabase Auth, sessions, RLS role"       --repo lowqualityloey/ppl-fitness-tracker
gh label create "area:frontend" --color "fbca04" --description "Client UI, presentation"                 --repo lowqualityloey/ppl-fitness-tracker
gh label create "area:ui"       --color "fbca04" --description "Design tokens, shadcn/ui"                --repo lowqualityloey/ppl-fitness-tracker
gh label create "area:perf"     --color "c2e0c6" --description "Latency, load, benchmarking"             --repo lowqualityloey/ppl-fitness-tracker
gh label create "priority/p0"   --color "b60205" --description "Blocker / critical path"                 --repo lowqualityloey/ppl-fitness-tracker
gh label create "priority/p1"   --color "d93f0b" --description "High priority / core flow"                --repo lowqualityloey/ppl-fitness-tracker
gh label create "priority/p2"   --color "fbca04" --description "Medium priority / enhancement"            --repo lowqualityloey/ppl-fitness-tracker
gh label create "priority/p3"   --color "c5def5" --description "Polish / nice-to-have"                    --repo lowqualityloey/ppl-fitness-tracker

# One-time: milestone
gh api repos/lowqualityloey/ppl-fitness-tracker/milestones -f title="M1: Contracts & Seams" \
  -f description="Schema, RLS, auth, Zod contracts, failing tests. See docs/specs/2026-09-08-spec-fullstack-migration.md §6." \
  -f state="open"

# Issues, in dependency order
gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(infra): Next.js 16 + React 19 + TS strict scaffold" \
  --body-file docs/tasks/m1/m1-01-nextjs-scaffold.md \
  --label "area:infra,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(infra): Supabase project + DATABASE_URL/MIGRATION_DATABASE_URL split" \
  --body-file docs/tasks/m1/m1-02-supabase-project-env-split.md \
  --label "area:infra,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(data): Drizzle schema for all 9 tables + initial migration" \
  --body-file docs/tasks/m1/m1-03-drizzle-schema-all-tables.md \
  --label "area:data,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(auth): app_authenticated role + handle_new_user trigger" \
  --body-file docs/tasks/m1/m1-04-app-authenticated-role-trigger.md \
  --label "area:auth,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(data): RLS on content tables (exercises, routine_days, routine_exercises)" \
  --body-file docs/tasks/m1/m1-05-rls-content-tables.md \
  --label "area:data,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(data): RLS on user-data tables, four policies each" \
  --body-file docs/tasks/m1/m1-06-rls-user-data-tables.md \
  --label "area:data,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "test(data): schema-drift merge gate, ported from M0 spike" \
  --body-file docs/tasks/m1/m1-07-drift-test-ported.md \
  --label "area:data,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "test(backend): tenancy integration gate, ported from M0 spike" \
  --body-file docs/tasks/m1/m1-08-tenancy-gate-ported.md \
  --label "area:backend,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(data): seed script — 18 exercises extracted from legacy app" \
  --body-file docs/tasks/m1/m1-09-seed-exercises.md \
  --label "area:data,priority/p1" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(data): seed script — 13 unique stretches, dual-day association" \
  --body-file docs/tasks/m1/m1-10-seed-stretches.md \
  --label "area:data,priority/p2" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(backend): withUserHardened() repository helper, canonical" \
  --body-file docs/tasks/m1/m1-11-with-user-hardened-helper.md \
  --label "area:backend,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(auth): Supabase SSR middleware + requireUser()" \
  --body-file docs/tasks/m1/m1-12-ssr-middleware-require-user.md \
  --label "area:auth,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(auth): magic-link sign-in + /auth/confirm with redirect allowlist" \
  --body-file docs/tasks/m1/m1-13-magic-link-signin-confirm.md \
  --label "area:auth,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(auth): custom SMTP provider + hourly synthetic monitor" \
  --body-file docs/tasks/m1/m1-14-custom-smtp-synthetic-monitor.md \
  --label "area:auth,priority/p0" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "feat(backend): Zod contracts for every route + AppError envelope" \
  --body-file docs/tasks/m1/m1-15-zod-contracts.md \
  --label "area:backend,priority/p1" --milestone "M1: Contracts & Seams"

gh issue create --repo lowqualityloey/ppl-fitness-tracker \
  --title "test(backend): failing route-handler tests (RED) for all 9 endpoints" \
  --body-file docs/tasks/m1/m1-16-failing-route-handler-tests.md \
  --label "area:backend,priority/p1" --milestone "M1: Contracts & Seams"
```

### GitHub Projects v2 sync (optional)

No project board designated yet — `gh project list --owner lowqualityloey` shows
three existing boards (`untitled project` #1, `weather dashboard` #2, `shelf's
project` #4), none named for this repo. Create one first if you want board
tracking:

```bash
gh project create --owner lowqualityloey --title "PPL Fitness Tracker"
# then, per issue, once created:
gh project item-add <project-number> --owner lowqualityloey --url <issue-url>
```
