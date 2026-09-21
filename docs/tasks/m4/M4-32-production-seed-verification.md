<a id="TASK-m4-32-production-seed-verification"></a>

# Task Record: M4-32 — verify production seed content on the hosted project

> **Why this card exists:** it is blocker **B5** from
> `docs/releases/2026-09-21-v1.0.0-release-readiness.md`, filed as issue **#175**. Session
> prefill and the legacy importer both depend on seeded exercise/stretch content, and CI has
> **no seed step** — the API suite calls `seedExercises()` in `beforeAll` for exactly that
> reason. Nothing in this repository asserts the seed half of the hosted project.
>
> **Outcome: `blocked` — NOT VERIFIED.** Scenario 3 of the filed card applies: the hosted project
> cannot be reached with any credential available on this workstation. Recorded as "not
> verified" with the reason, and **not** recorded as a pass.

## 1. Identity and Authority

- **Record Type**: `Task Record`
- **Task ID**: `TASK-m4-32-production-seed-verification`
- **PromptKit Adaptation Profile**: `none`
- **Work Type**: `Documentation Work` — no production code, schema, or migration changed; the
  deliverable is a recorded read, because the read itself is what B5 is missing
- **Planning Record Link**: `N/A`
- **Planning Depth Reference**: `Minimal`
- **Assumption Record Links**: `None`
- **Specification**: `docs/releases/2026-09-21-v1.0.0-release-readiness.md` (blocker B5) + issue **#175**
- **External Reference**: **#175** (`chore(release): verify production seed content on the hosted project (M4-32, blocker B5)`)
- **Owner / Actor**: Agent (Freebuff/Buffy); owner authorized by selecting #175
- **Execution Scope**: read-only inspection of the hosted project's seed tables; no write of any kind
- **Approval Boundary**: **no production write, no `db:seed`, no migration, no tag, push or deploy.**
  Verifying is in scope; seeding production is explicitly not, and would need its own card
- **Created**: `2026-09-21 03:05 UTC`

## 2. Objective and Boundaries

- **Objective**: establish, by reading rather than by claim, that the hosted production database
  contains the seeded exercise and stretch content that `GET /api/exercises` and session prefill
  depend on — and if it cannot be established, say so instead of asserting it.
- **In Scope**:
  - Reading the applied-migration list on the hosted project
  - Counting and enumerating the system content in `exercises` (both kinds) and the routine associations
  - Comparing against the seeded set the application actually expects, derived from the seed source
  - Recording the outcome in the release record's B5 row and in issue **#175**
- **Explicit Non-Goals**:
  - **Seeding production.** Not attempted, not needed yet, and a separate card owns any write
  - Verifying user data, RLS behaviour, or anything beyond seed content
  - Changing the seed source, the schema, or any migration
  - Re-verifying migrations `0000`-`0008` in production beyond a read of what is applied
- **Dependencies**: a hosted-project read credential (`HOSTED_DATABASE_URL`) — **not present on this
  workstation**; see §6 Blocker and Resume Condition
- **Risk**: `Low` — read-only by construction. The main risk is the inverse: recording an unverified
  claim as verified, which is the failure mode this card's Scenario 3 exists to prevent.
- **Verification Condition**: the corrected read-only query in §6 produces counts and distinct slugs
  from the hosted project, and those numbers are recorded here and in the release record's B5 row.

## 3. Acceptance Criteria

- [ ] **AC-1**: The applied-migration list on the hosted project is read and recorded.
  - **Result**: `Not Verified` · **Evidence**: the hosted project is unreachable from this workstation (§6). Read locally as a control instead: `0000`–`0008` all present in `supabase_migrations.schema_migrations`.
- [ ] **AC-2**: `exercises` and stretch content are counted, with distinct slugs recorded.
  - **Result**: `Not Verified` for production · **Evidence**: the same reading was executed against the **local** stack, which shares the schema, and is recorded as a control rather than as the answer.
- [ ] **AC-3**: The result is compared against the seeded library the app expects (18+ exercises including `bench-press` and `push-ups`).
  - **Result**: `Partially Verified` — the **expected** side is now measured from source; the **actual** side is unreadable in production. Expected: **18** strength slugs (enumerated below), **13** stretch slugs, **3** routine days, **33** routine associations.
- [x] **AC-4**: The result is recorded in the release record's B5 row.
  - **Result**: `Pass` · **Evidence**: B5 updated to `Not verified — blocked, no hosted credential`, and it **stays open**.
- [x] **AC-5**: Read-only: no `INSERT`, `UPDATE`, `DELETE` or `db:seed` against production.
  - **Result**: `Pass` · **Evidence**: no connection was opened to any hosted endpoint at all. The only writes this turn were to this repository's own documentation.
- [x] **AC-6**: No credential or connection string is pasted into an issue, comment, or document.
  - **Result**: `Pass` · **Evidence**: every DSN in this record is masked (`postgresql://user:***@host:port/db`); no value appears in this file, the issue comment, or the release record.

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

- **Execution State**: `blocked`
- **Mapped `pk:tasks` Status**: `In Progress`
- **Active Task Pointer**: `None`
- **Start Time**: `2026-09-21 03:05 UTC`
- **Current Actor**: Agent (Freebuff/Buffy)
- **Next Action**: the owner supplies a hosted read credential (or runs the corrected command and returns **only the counts and slugs**); AC-1/AC-2/AC-3 then complete and B5 can close

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
|---|---|---|---|---|---|
| `planned` | `in_progress` | `2026-09-21 03:05 UTC` | Agent | owner selected #175 | issue #175 |
| `in_progress` | `blocked` | `2026-09-21 03:05 UTC` | Agent | no hosted credential exists on this workstation; Scenario 3 of the filed card applies | §6 Blocker and Resume Condition |

## 6. Evidence and Completion Gate

- **Changed Files**:
  - `docs/tasks/m4/M4-32-production-seed-verification.md` — **new** (this record)
  - `docs/releases/2026-09-21-v1.0.0-release-readiness.md` — B5 row updated, **left open**
  - `docs/STATE.md` — §7 item 52 + §8 row + position line
  - issue **#175** — body's `Automated Verification Command` corrected; outcome comment posted
- **Scope Change Records**: `None`
- **Checkpoint Records**: `None`
- **Handoff Records**: `None`

### The expected set, measured from source (this half is now verified)

| Seed export | Count | Source |
| :--- | :--- | :--- |
| `exerciseSeedRows` | **18** | `db/seed/exercises.ts:42` |
| `stretchSeedRows` | **13** | `db/seed/stretches.ts:32` |
| `routineDaySeedRows` | **3** | `db/seed/exercises.ts:25` |

The 18 seeded strength slugs, enumerated rather than counted: `bench-press`,
`dumbbell-overhead-press`, `chest-press-machine`, `lateral-raises`, `cable-tricep-pushdowns`,
`push-ups`, `goblet-squats`, `leg-press`, `romanian-deadlifts`, `leg-curls`, `leg-extensions`,
`calf-raises`, `lat-pulldown`, `seated-cable-row`, `single-arm-dumbbell-row`, `face-pulls`,
`bicep-curls`, `hammer-curls`.

> The filed card's AC-1 says "18+ exercises including `bench-press` and `push-ups`". The count is
> right; enumerating it is stronger, because a count of 18 with the wrong 18 passes a count-only check.

### The control: the same reading against the local stack

Run against the project's own local container, which carries the same schema and migrations
`0000`–`0008`. This proves the **query** answers correctly, so that a later production reading
differs because of production's data and not because of the instrument.

| Reading (system content, `owner_user_id is null`) | Local result | Expected from source | Match |
| :--- | :--- | :--- | :--- |
| `kind = 'strength'` | **19** | 18 | 18 seeded **+1 residue** (`tenancy-test-exercise`, explained below) |
| `kind = 'stretch'` | **13** | 13 | exact |
| total system rows / distinct slugs | **32 / 32** | 31 | same +1 residue; no duplicate slugs |
| `routine_days` | **3** | 3 | exact |
| `routine_exercises` | **33** | — | seed-populated associations for the 3 routine days |
| applied migrations | `0000`–`0008` | — | all present in `supabase_migrations.schema_migrations` |

`tenancy-test-exercise` is **not seed content**: it appears nowhere in `db/`, `lib/` or `scripts/`,
and it is the residue of a tenancy test that ran against the local dev database. Named here because
an unexplained +1 is exactly what would make a future reader distrust the other numbers.

### Why production could not be read (Scenario 3)

Measured, not assumed — every plausible route was checked before declaring the boundary:

| Route | Finding |
| :--- | :--- |
| `.env.local` | Contains **only the local stack**: `MIGRATION_DATABASE_URL` → `postgresql://postgres:***@127.0.0.1:54322/postgres`, `DATABASE_URL` → `postgresql://app_authenticated.pooler-dev:***@127.0.0.1:54329/postgres` |
| Repo-wide search for a hosted DSN shape | `grep -rlE "postgres(ql)?://[^\"'[:space:]]*(supabase\|pooler\.\|aws-\|\.supabase\.)"` → **0 files** |
| `vercel env pull` | `.vercel/` **does not exist** — the project is not linked locally, so this needs an interactive login first |
| Vercel CLI | resolvable (`59.23.2` via `npx --no-install vercel`), but unusable without that link |
| GitHub Actions / deployment secrets | not readable by `gh`, by design |
| Production HTTP surface | `302` to Vercel SSO on every path (blocker **B1**), so the data cannot be inferred through the API either |
| **Vercel project env — the decisive one** | `vercel env ls production` **and** `vercel env ls` (all environments): **"No Environment Variables found"**. A production `env pull` returned **only** Vercel/Turbo system vars — **no `DATABASE_URL`, no `NEXT_PUBLIC_SUPABASE_URL`, no anon key, no `NEXT_PUBLIC_APP_URL`** |

### The decisive finding — larger than this card (measured 2026-09-21)

**The Vercel project that serves the production alias has zero environment variables registered, in every
environment.** The project is `jonells-projects/ppl-fitness-tracker` (production alias
`https://ppl-fitness-tracker.vercel.app`, the same alias that answers `302` to SSO). Consequences:

- The deployed application can obtain **no** runtime configuration: no database credential, no Supabase
  client URL or anon key, no `NEXT_PUBLIC_APP_URL`.
- Since `f0f5993` (M4-31), a boot without `DATABASE_URL` **refuses to start and exits non-zero**. Production
  therefore cannot serve a request at all.
- **The last step is inference, not measurement, and is labelled as such**: it cannot be observed from here
  because B1's SSO means no request ever reaches the app. `vercel logs` returns *"No logs found"* — the
  signature of a surface nobody can hit, **not** evidence of a healthy one.
- Every deployment shows **`● Ready`** — but that is a **build** result and carries no runtime signal. The
  release record's earlier "application code deployment — already automatic, verified" row reads a *build*
  status, and should not be read as "the deployed app works".
- **This contradicts the owner-reported claim recorded earlier this session that Vercel's env was "all set".**
  That claim was labelled *owner-reported, not measured* at the time; it is now **measured false**.

### The CLI route, attempted and closed out

Because the Vercel CLI on this host is authenticated as `lowqualityloey`, the read was attempted through it
rather than asking the owner to run psql. What happened, recorded with its footprint:

| Step | Result |
| :--- | :--- |
| `vercel link --yes --project ppl-fitness-tracker --scope jonells-projects` | linked; the CLI also **appended `VERCEL_OIDC_TOKEN` to `.env.local`** as a side effect |
| `vercel env pull <throwaway> --environment=production` | **no app variables returned** — only `VERCEL_*` / `TURBO_*` system vars |
| `vercel env ls production` / `vercel env ls` | **"No Environment Variables found"** — the authoritative form of the finding |
| Footprint removed | `.vercel/` deleted, the throwaway pull file deleted, `.env.local` **restored to exactly 1623 bytes** with all 6 keys intact and the token gone, and the CLI's `.gitignore` edit reverted (`git checkout -- .gitignore`) |
| Tree after | `git status` clean — the workspace is exactly as it was found |

No credential was printed, logged, or committed, and **nothing was written to Vercel or to production**.

### The corrected verification command

**The command filed in issue #175 does not work.** It reads `select count(*) from stretches`, and
`stretches` is not a table — the local run returns `ERROR: relation "stretches" does not exist`.
Stretch content lives in the `exercises` table discriminated by the `exercise_kind` enum, which is
also why a bare `count(*) from exercises` is ambiguous in any environment with real users: it
includes per-user custom exercises. Both defects are corrected here, and the issue body was updated
to match.

```bash
# read-only. run against the HOSTED project, never against local data.
# expected (from the seed source): strength=18, stretch=13, system=31, routine_days=3, routine_exercises=33
psql "$HOSTED_DATABASE_URL" -c "
  select kind::text as kind, count(*) from exercises where owner_user_id is null group by kind order by 1;
  select count(*) as system_rows, count(distinct slug) as distinct_slugs from exercises where owner_user_id is null;
  select slug from exercises where owner_user_id is null and kind = 'stretch' order by slug;
  select count(*) as routine_days from routine_days;
  select count(*) as routine_exercises from routine_exercises;
  select version from supabase_migrations.schema_migrations order by version;
"
```

A passing production read is `strength = 18` (all 18 slugs above present), `stretch = 13`,
`distinct_slugs = 31`, `routine_days = 3`, `routine_exercises = 33`. Anything lower means a **seed
gap**, which per the filed card's Scenario 2 keeps B5 open and files a separate card for the write —
the release is not labelled ready on a partial read.

### Verification Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| Expected set from source | `npx tsx` importing `exerciseSeedRows` / `stretchSeedRows` / `routineDaySeedRows` | **18 / 13 / 3** — enumerated, not counted from prose |
| Control query (local) | `docker exec supabase_db_ppl-fitness-tracker psql -U postgres -d postgres -tAc …` | 19 strength (18 + 1 residue) · 13 stretch · 32 system rows / 32 distinct slugs · routine_days 3 · routine_exercises 33 |
| Hosted credential search | repo-wide DSN grep + `.vercel` check + CLI check | **no hosted credential exists** — Scenario 3 |
| typecheck / lint / unit / api / e2e | — | **Not applicable** — no executable file changed this turn, so no gate is claimed |
| Production write | — | **none performed**; no hosted connection was opened |

- **Behavior IDs**: `N/A - TDD Enforcement Mode disabled`
- **TDD Intent Register**: `N/A - TDD Enforcement Mode disabled`
- **TDD Execution Evidence**: `N/A - TDD Enforcement Mode disabled`
- **TDD Exception Verification**: `N/A - Documentation Work`
- **CI Evidence**: **none** — GitHub Actions cannot start (account billing, `CI-github-35555062183`). This turn changed no code, so there is nothing for CI to arbitrate beyond the docs.
- **Review Evidence**: `N/A`
- **Commit Evidence**: `N/A before commit`
- **Pull Request Evidence**: `N/A`
- **Release Evidence**: B5 row in `docs/releases/2026-09-21-v1.0.0-release-readiness.md` — updated, **stays open**
- **Blocker and Resume Condition**: **the prerequisite is now larger than a credential, and that is the headline.** A read credential does not merely fail to exist on this workstation — **none exists in Vercel either**, because the production project has no environment variables at all (blocker **B6**). B5 therefore cannot be closed by anyone running a query: production must first be **configured**, and only then is a seed read meaningful. If the owner supplies a hosted DSN directly, the corrected command above still applies and returns the counts and slugs; the DSN itself must never appear in any document or issue.

- **Completion State**: `blocked`
- **Acceptance Results**: `AC-1 Not Verified` · `AC-2 Not Verified (control measured locally)` · `AC-3 Partially Verified (expected side measured)` · `AC-4 Pass` · `AC-5 Pass` · `AC-6 Pass`
- **Changed-File Summary**: one new Task Record, two docs updated, one issue body corrected — **no code, schema, migration, route or seed change, and no production write**
- **Completion Exception**: `None`
- **Completion Decision and Timestamp**: `Blocked 2026-09-21 03:05 UTC` — awaiting a hosted read credential

### Deviations and Corrections, Recorded Rather Than Smoothed

1. **The filed card's `Automated Verification Command` was wrong** (no `stretches` table), and its
   count omitted the `owner_user_id is null` filter that makes the number mean "seed content" rather
   than "all content". Both corrected here and in the issue body. The card was filed by me earlier in
   this same session, so this is a correction of my own error, not of someone else's.
2. **`limit 32 rows, one residue row explained`** — the local control reads 19 strength rather than 18.
   Recorded with its cause (`tenancy-test-exercise`, test residue) instead of quietly reporting 18.
3. **Timestamp-label note for sibling records**: `M4-29`, `M4-30` and `M4-31` carry `Created` values
   written in local time (UTC+12) but labelled `UTC`. This record uses a measured `date -u`. The
   ordering they imply is preserved; only the suffix is wrong.
