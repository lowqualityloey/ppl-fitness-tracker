# Project State & Living Execution Tracker

## 1. Executive Summary & Current Position

- **Project Name**: PPL Fitness Tracker
- **Current Milestone / Epic**: **M0 complete — M1 unblocked, not started**
- **Overall Status**: ACTIVE <!-- Options: ACTIVE | PAUSED | STABILIZING | RELEASE_CANDIDATE -->
- **Target Release**: v1.0.0, no date committed
- **Current Working Branch**: `main` (last commit `6986dcc` — "Improve confidence panel layout and scroll behavior")
- **Last Updated**: 2026-09-08

**Where things actually stand.** The legacy vanilla-JS app is still the only thing that runs. A full-stack rebuild is specced, all six architectural decisions are recorded as ADR-0001…0005, and **the M0 spike is done and green** — RLS enforcement is demonstrated through Drizzle against Postgres 17.6, with every control shown to fail loudly when removed. ADR-0003 survives, amended (A1).

**Still no application code for the target stack.** What exists is a throwaway spike harness at `spikes/m0-drizzle-rls/` (32 assertions) whose purpose was to answer one question before M1 commits a schema. The gate on M1 is lifted; the next step is decomposing M1 into atomic issues via `pk:tasks`.

---

## 2. Milestone & Task Progress

### Milestone Roadmap

- [x] **Planning**: Spec written, six decisions resolved, ADRs recorded (Complete — 2026-09-08)
- [x] **M0**: De-risk spike — RLS enforcement proven through Drizzle (Complete — 2026-09-08, **gate lifted**)
- [ ] **M1**: Contracts & Seams — schema, RLS, auth, Zod contracts, failing tests (**Decomposed into 16 issues, not yet filed**, no longer blocked — see `docs/tasks/2026-09-08-m1-contracts-seams-tasks.md`)
- [ ] **M2**: Core Domain Engine — SessionEngine, SyncEngine, LegacyImporter (Queued)
- [ ] **M3**: Presentation — shadcn + tokens, session runner, offline outbox, WCAG audit (Queued)
- [ ] **M4**: Hardening, telemetry, decommission the legacy static app (Queued)

### Completed Milestone Task Breakdown (M0)

`[x]` Done · `[/]` In Progress · `[ ]` Queued · `[!]` Blocked

- [x] `M0-00`: Node runtime ≥ 20.9 available — resolved 2026-09-08, see §5
- [x] `M0-01`: `app_authenticated` role created `LOGIN NOBYPASSRLS NOSUPERUSER NOINHERIT`, owns nothing. Attributes asserted by test, since migrations cannot re-force them (A1.4)
- [x] `M0-02`: Two tables, eight policies, `ENABLE` + `FORCE ROW LEVEL SECURITY` on both
- [x] `M0-03`: Two real GoTrue users seeded; cross-user read, update and delete return zero through Drizzle, cross-user insert rejected `42501`
- [x] `M0-04`: `current_user = 'app_authenticated'` asserted; owner connection shown to read everything despite `FORCE`, which is the trap this closes
- [x] `M0-05`: Drift check written and proven against a deliberately unprotected table. Widened past `rowsecurity = false` to also catch zero-policy tables and `FOR ALL`
- [x] `M0-06`: No leak with `is_local = true`, direct and through supavisor transaction pooling. The `false` variant run first as a negative control and shown to leak
- [x] `M0-07`: Write-up at `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`
- [x] `M0-08` (added mid-spike): mutation check — each control removed in turn, suite required to go red

**M0 exit criteria: met.** 32 assertions green, `npm run mutate` catches all three
mutations, ADR-0003 confirmed rather than reopened. Amendment A1 records the five
corrections; none of them changed the decision.

---

## 3. Active Working Set

- **Target Workspace / Package**: N/A (standalone repo)
- **Active RFC / Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md`
- **Active Task Spec**: `docs/tasks/2026-09-08-m1-contracts-seams-tasks.md` — M1 decomposed into 16 atomic issues (`M1-01`…`M1-16`), ~45h total. **Not yet filed on GitHub** — `gh` CLI is authenticated against `lowqualityloey/ppl-fitness-tracker` (private) and the create commands are ready in the task doc, awaiting explicit confirmation to run them.
- **Key Source Files in Flight**: none. No target-stack code exists.
- **Spike sandbox — throwaway, delete once M1's integration suite covers the same ground**:
  - `spikes/m0-drizzle-rls/sql/001-setup.sql` — role, tables, 8 policies, `handle_new_user`. Comments record the measured surprises. **Creates `unprotected_future_table` on purpose**; do not copy it.
  - `spikes/m0-drizzle-rls/src/db.ts` — `withUserHardened()` is the version M1 must adopt. `withUserLeaky()` is a negative control, never to be imported.
  - `spikes/m0-drizzle-rls/tests/` — 5 files, 32 assertions
  - `spikes/m0-drizzle-rls/scripts/mutation-check.ts` — proves the suite can fail
  - `spikes/m0-drizzle-rls/scripts/bench.ts` — the ADR-0003 cost measurement
- **Legacy files that M1 reads as input** (source of seed data, do not delete before M4):
  - `push-day-workout/index.html` — 6 exercises, 17 set checkboxes, 5 stretches, hardcoded
  - `legs-day-workout/index.html` — same shape
  - `pull-day-workout/app.js:47-223` — the only module with structured exercise/stretch data arrays
- **Verification Commands** (all must run inside WSL):
  - Legacy dev: `npm run dev`
  - Target tests: not yet scaffolded
  - Spike, from `spikes/m0-drizzle-rls/`: `npm run db:up` → `npm run db:setup` → `npm test` (32 pass) → `npm run mutate` → `npm run db:down`. Needs Docker.

---

## 4. Locked Technical Invariants (Do Not Undo)

Derived from ADR-0001…0005. Changing any of these means superseding the ADR, not editing code.

> Items 3–6 and 13–16 were **verified empirically** by the M0 spike on 2026-09-08, not merely decided. Evidence: `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`.

1. **Next.js 16 + React 19 + TypeScript strict.** Node ≥ 20.9. (ADR-0001)
2. **Supabase Auth owns identity.** `profiles.id` *is* `auth.users.id`; every domain FK points at `profiles.id`. No mirror table, no identity-sync webhook. (ADR-0002)
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

---

## 5. Known Blockers, Risks & Open Questions

### Blockers

**None currently.**

*Resolved 2026-09-08 — `M0-00`, Node runtime.* Initially filed as "WSL Node is 18.19.1, too old for Next.js 16." That was overstated. `~/.nvm/versions/node/` already contained v22.19.0 and v24.18.0, and the `PATH` prepend at `~/.zshrc:119-122` selects the highest, so the **interactive** shell was already on Node 24 and Next.js 16 would have run fine.

The real and narrower issue: **non-interactive shells resolve `/usr/bin/node` v18.19.1**, because zsh does not source `.zshrc` for non-interactive invocations and `.bashrc` contains no nvm block. That affects automation and agent-run commands, not the user typing in a terminal.

Actions taken: `nvm install --lts` → v24.20.0, set as nvm default (additive; `/usr/bin/node` untouched). `PROMPTKIT.md` §3 now documents the explicit-source command form that automation must use, plus an optional `~/.zshenv` fix that was deliberately *not* applied since it changes the user's environment rather than the repo.

**Standing caution**: `node --version` reporting v18 is the signal that nvm was not sourced. Check it before trusting any build result.

### Open Questions

- **`--accent-legs` has no assigned colour.** `DESIGN.md` offers no third accent that can be legitimately spent; `tertiary #667085` is reserved for disabled states, so reusing it would make disabled controls read as Legs day. One new hue must be added to `DESIGN.md` as a documented extension. *Blocks M3, not M1.*
- **Package manager for the target app.** Legacy is npm. Low-stakes; decide at M1 scaffold and record it in PROMPTKIT.md §3.
- **Dark mode deferred.** `DESIGN.md` ships no dark tokens. Light-only in v1 per ADR-0005, with tokens authored under one `:root` so adding a `.dark` block stays additive. Revisit immediately post-v1 — this app gets used in dim gyms at night.

### Technical Debt & Risks

- **Custom SMTP is a launch blocker, not polish.** Supabase's default sender allows 2 emails/hour from a shared generic address. On a magic-link-only app that is the entire front door. Moved into M1 with an hourly synthetic monitor.
- **Legacy `npm run build` emits zero JavaScript** and exits 0 while doing so. Verified 2026-09-08. Cause: classic `<script>` tags Vite won't process. Not being fixed — the legacy app is decommissioned in M4 — but do not mistake a green build for a working one.
- **Pull-day legacy set data is unrecoverable.** `saveProgress()` keyed checkbox state by `checkbox.id`, and the generated set checkboxes never had one, so all 17 collapsed into a single `"undefined"` key. Only aggregate counts survive the import. Accepted and documented in spec §4.5.
- ~~**Per-request transaction cost of ADR-0003 is unmeasured.**~~ **Measured 2026-09-08.** `withUser()` costs **+1.29 ms p50 / +1.87 ms p95** over an app-scoped autocommit `SELECT` on a direct connection, **+1.98 ms p50 / +2.35 ms p95** through supavisor in transaction mode. Four round trips instead of one, so it scales with RTT and will be worse from a region distant from the database. Affordable against the spec §2 SLA. *What remains open is narrower: pool exhaustion under sustained load. The spike reached 40 interleaved concurrent transactions on one container, which is not a load test. Still an M4 item.*
- **M0 findings are from the local stack, not a hosted project.** Roles and `auth.uid()` came from the stock Supabase image so behaviour should match, but two findings (the silently-discarded `GRANT` on `auth`, and the refusal to `ALTER` role attributes) are mediated by `supautils` and could differ on a hosted plan. Re-assert both during M1 against a real project.
- **The magic-link flow is still unproven.** M0 used the password grant to obtain real JWTs cheaply. The `sub` claim is identical either way, so the RLS conclusion is unaffected, but no part of the actual sign-in path has been exercised.
- **`node_modules` present but installed for verification only.** Installed 2026-09-08 inside WSL to confirm the build defect. Gitignored, safe to delete.

---

## 6. Recent Architectural Decisions (ADR Log)

| Date | Title & Scope | Decision Summary | ADR File |
| :--- | :--- | :--- | :--- |
| 2026-09-08 | Framework version | Next.js 16 + React 19 + TS strict. Requested "Next.js 14 + React 19" is not a valid pair — React 19 stabilised in Next 15, and 14 is EOL. | `docs/adrs/0001-nextjs-16-react-19.md` |
| 2026-09-08 | Auth provider | Supabase Auth, replacing the originally requested Clerk. Removes a vendor, the identity-sync webhook, the mirror table, and the custom RLS resolver function. | `docs/adrs/0002-supabase-auth-over-clerk.md` |
| 2026-09-08 | Authorization model | Both layers. App scoping authoritative, RLS under a `NOBYPASSRLS` non-owner role as backstop. **Confirmed empirically by M0 and amended (A1)**: `withUser` needs a second `set_config`, the app role gets nothing on the `auth` schema, `FORCE` does not stop the owner, role attributes cannot be re-forced by migration, and the cost is now measured. Decision unchanged. | `docs/adrs/0003-rls-defense-in-depth.md` |
| 2026-09-08 | Focus ring contrast | Override `DESIGN.md`. 2px `#465fff` (~4.8:1) replaces `#ecf3ff` (~1.1:1), which fails SC 1.4.11. | `docs/adrs/0004-focus-ring-contrast-override.md` |
| 2026-09-08 | Design tokens + set logging | One base palette plus three scoped day accents; light-only v1. Weight and reps in scope, nullable, prefilled from last session, kg canonical. | `docs/adrs/0005-design-tokens-and-set-logging.md` |

---

## 7. Next Immediate Actions (Queued)

1. **File the 16 M1 issues on GitHub** (`pk:tasks` output ready, not yet executed). Labels `area:*`/`priority/p0-p3` don't exist yet in the repo (only the default `bug`/`enhancement`/etc. set), no milestone exists, no project board is designated for this repo. Commands for all three, plus the 16 `gh issue create` calls, are in `docs/tasks/2026-09-08-m1-contracts-seams-tasks.md`.
2. **Commit the M0 + M1-planning work.** `docs/`, `spikes/`, `AGENTS.md`, `DESIGN.md`, `PROMPTKIT.md` are all untracked. Nothing is on a branch yet.
3. **Start execution on `M1-01`** (Next.js scaffold) once issues are filed — it has no dependencies and unblocks everything else.
4. **Parallel track, no dependency on the RLS/auth chain**: `M1-09`/`M1-10` (seed extraction) need only `M1-03`'s schema.
5. **Decide the package manager** for the target app at `M1-01`'s scaffold step, and record it in `PROMPTKIT.md` §3.
6. **`pk:grill`** is now better value than it was: there is measured evidence to defend. Remaining priority targets are the LWW justification and outbox behaviour across a multi-day offline gap — the connection-pool question has narrowed to sustained-load exhaustion, which is an M4 load test rather than an architecture argument.
7. **Before M3**: agree the `--accent-legs` hue and add it to `DESIGN.md`.

---

## 8. Session Continuity Log

| Date | Engineer / Agent | Milestone / Focus | Key Changes & Artifacts |
| :--- | :--- | :--- | :--- |
| 2026-09-08 | Owner + Kiro | Codebase review | Full read of legacy app. Found: production build emits zero JS (verified by running it); dashboard metrics fabricated from `getDay()` and `Math.random()`; `legs` phase gating stubbed to `return true`; documented `AuthManager` unreachable; pull-day set persistence writes to a single `"undefined"` key; zero `aria-*` attributes in `push-day-workout/index.html`. |
| 2026-09-08 | Owner + Kiro | `pk:plan` | Wrote `docs/specs/2026-09-08-spec-fullstack-migration.md`. Flagged that Next 14 + React 19 is invalid, that Drizzle bypasses Supabase RLS by default, and that `DESIGN.md`'s focus ring fails WCAG. Six decisions raised for sign-off. |
| 2026-09-08 | Owner + Kiro | Decisions + ADRs | All six resolved. Spec revised end-to-end for Supabase Auth. ADR-0001…0005 written. While writing ADR-0003, found two holes in the tenancy test gate and the `set_config` `is_local` leak — both now covered in M0. Deleted `DESIGN.md:Zone.Identifier`. |
| 2026-09-08 | Owner + Kiro | Context sync | Filled `PROMPTKIT.md` and this file — both were still PromptKit placeholder templates asserting an "Acme Dashboard" monorepo, `pnpm`, and a blocked Milestone 2. |
| 2026-09-08 | Owner + Kiro | Node runtime | Filed a Node-version blocker, then found it was overstated: interactive shells were already on Node 24 via the `.zshrc` nvm PATH prepend; only non-interactive shells resolve `/usr/bin/node` v18. Installed v24.20.0 LTS as nvm default and documented the explicit-source command form in `PROMPTKIT.md` §3. No dotfiles modified. |
| 2026-09-08 | Owner + Kiro | `pk:spike` (M0) | Built `spikes/m0-drizzle-rls/` against the local Supabase stack. **32 assertions green; ADR-0003 confirmed, M1 unblocked.** Five things the spec had wrong or missing, all now folded back: `auth.uid()` checks the legacy singular GUC *first*, so `withUser` as specified could be silently overridden into reading another user's row; `GRANT USAGE ON SCHEMA auth` as `postgres` returns success and does nothing; the app role needs no `auth` access at all, so least privilege is stricter than assumed; `FORCE ROW LEVEL SECURITY` does not stop `postgres` because `BYPASSRLS` wins; role attributes cannot be re-`ALTER`ed by an idempotent migration. Also: Postgres is 17.6, not 16. Added a mutation check after realising a green suite proves nothing — it immediately caught that the idempotent DDL was healing every mutation before assertions ran. Measured the ADR-0003 cost (+1.29 ms p50 direct, +1.98 ms pooled), closing an open risk. ADR-0003 amended (A1), spec §4.2/§6/§8 updated. |
| 2026-09-08 | Owner + Kiro | `pk:tasks` (M1) | Decomposed M1 into 16 atomic 1–4h issues across scaffold/infra, schema/RLS/data, auth, and contracts tracks, ~45h total. Dispatched a context-gatherer to pin down the legacy exercise/stretch data precisely (file:line for all 18 exercises across the three legacy sources) rather than estimate — found the stretch count is not simply additive: 15 raw entries across push/legs/pull but only 13 unique concepts, since "Child's Pose" and "Cat-Cow Stretch" are each duplicated verbatim across push-day and pull-day. Split seeding into two issues (`M1-09` exercises, `M1-10` stretches) specifically so that dedup decision gets its own review rather than being buried. Every issue's AC traces back to a spec section, ADR, or a named M0 spike finding — `M1-04`/`M1-11` exist specifically to port the spike's verified `app_authenticated`/`withUserHardened` patterns rather than re-derive them from the spec's original (incomplete) sketch, and `M1-07`/`M1-08` port the drift test and tenancy gate with their negative controls intact. Checked GitHub state first: repo is private, `gh` authenticated, zero existing issues/milestones, only default labels. Full breakdown at `docs/tasks/2026-09-08-m1-contracts-seams-tasks.md` plus 16 files under `docs/tasks/m1/`. **Not yet filed** — awaiting confirmation before running the label/milestone/issue-create commands against the real repo. |
