# M4 #89 verification audit — the migration-authorship and cascade gates watched to fail

**Task:** M4-00 (#89), Definition-of-Done step ("The chosen trap-disarm step was **watched to
behave**"). **Date:** 2026-09-12. **Branch:** `feat/m4-089-migration-authorship`.

Format follows `docs/tests/2026-09-11-m3-verification-audit.md`: each entry is a violation
**injected on purpose** or a failure **observed while building the gate**, with the real captured
output. Nothing reconstructed after the fact. Entries 1 and 8 are the control's *pre-history* —
what the gates exist because of — captured on `origin/main` (`793db53`) before the fix existed.

---

## 1. The D4 trap itself, fired deliberately → phantom migration, exit 0, journal rewritten

On the branch base, before any change, with the stack up and nothing to migrate:

```
$ npm run db:generate

> ppl-fitness-tracker@0.0.0 db:generate
> drizzle-kit generate

No config path provided, using default 'drizzle.config.ts'
Reading config file '.../drizzle.config.ts'
12 tables
...
[✓] Your SQL migration file ➜ supabase/migrations/0004_warm_ozymandias.sql 🚀
--- exit: 0 ---
 M supabase/migrations/meta/_journal.json
?? supabase/migrations/0004_warm_ozymandias.sql
?? supabase/migrations/meta/0004_snapshot.json
```

66 lines / 28 statements, computed from the stale `0002` snapshot: `CREATE TABLE "sync_changes"`
and `"sync_entity_versions"` (already shipped by hand-authored `0006`), `DROP INDEX
"routine_exercises_day_order"` (shipped by `0000`), `ALTER COLUMN target_sets DROP NOT NULL`
(relaxed by `0004`) — and a **second `0004_*` file** colliding with the version prefix the Supabase
CLI already tracks. The journal mutation recorded its own file as `idx: 4, tag:
"0004_warm_ozymandias"`, so the journal's `0004` and the directory's `0004` became different
files. Exit 0. Three existing migration files invisible to the tool. Reverted
(`rm` + `git checkout` — before any of my own changes existed to endanger; verified `CLEAN`).

**This is why model (b) was chosen** (ADR-0006): the journal cannot be made "authoritative"
without fabricating snapshots, and the actual applier (`supabase start`, per
`.github/workflows/test.yml`) ignores the journal entirely.

## 2. Post-fix: the command refuses loudly

```
$ npm run db:generate
npm error Missing script: "db:generate"
...
exit=1
```

## 3. Post-fix: bare `drizzle-kit generate` writes nowhere near the applied chain

The card's model-(b) acceptance was "refuses **or** writes nowhere near `supabase/migrations`";
measured — it falls back to `./drizzle/`, now gitignored:

```
$ npx drizzle-kit generate
[✓] Your SQL migration file ➜ drizzle/0000_shocking_boom_boom.sql 🚀
$ git status --porcelain supabase/migrations     # only this branch's own intended changes:
 D supabase/migrations/meta/0000_snapshot.json   # (the journal purge itself)
 D supabase/migrations/meta/0002_snapshot.json
 D supabase/migrations/meta/_journal.json
?? supabase/migrations/0007_auth_user_cascade.sql
```

## 4. Authority guard — `db:generate` script restored (injected) → RED

`"db:generate": "drizzle-kit generate"` put back into `package.json`:

```
FAIL tests/unit/migration-authority.test.ts > ... exposes no npm script that runs drizzle-kit
AssertionError: drizzle-kit must not be reachable via npm scripts (ADR-0006: migrations are
hand-authored; db:generate reasoned from a stale journal and emitted a phantom destructive
migration with exit 0). Offending scripts: db:generate: expected [ 'db:generate' ] to deeply equal []

 Test Files  1 failed (1)      Tests  1 failed | 3 passed (4)
```

## 5. Authority guard — `out:` re-pointed, journal resurrected, version duplicated (injected) → RED ×3

`out: './supabase/migrations'` re-added to `drizzle.config.ts`:

```
FAIL ... > drizzle.config.ts declares no `out:` and never names supabase/migrations in code
AssertionError: drizzle.config.ts must not set `out:`. With out unset, generate falls back to the
gitignored ./drizzle/ scratch (measured 2026-09-12); with out pointing at supabase/migrations the
stale-journal trap is back (ADR-0006).: expected true to be false
```

`supabase/migrations/meta/_journal.json` recreated (what `drizzle-kit generate` does by itself —
entry 1's `M _journal.json`):

```
FAIL ... > leaves no drizzle journal behind inside supabase/migrations
AssertionError: supabase/migrations/meta/ must not exist. A journal that lists only some shipped
files is the mixed-authority lie D4 recorded; ...: expected true to be false
```

A phantom `0006_warm_ozymandias.sql` copied in — exactly entry 1's collision signature:

```
FAIL ... > migration files obey the filename contract the applier depends on
AssertionError: The Supabase CLI applies supabase/migrations/*.sql in filename order and tracks
them by 4-digit version. ...: expected [ Array(1) ] to deeply equal []
+ [ "0006_warm_ozymandias.sql: version 6 breaks contiguity (expected 7)" ]
```

All three injections reverted; guard then **4/4 green** (`Test Files 1 passed · Tests 4 passed`).

## 6. Cascade FK — constraint dropped (injected) → 5 of 6 tests red, restored → green

```
$ <owner> ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_auth_users_fkey
constraint dropped
 ❯ tests/integration/auth-user-cascade.test.ts (6 tests | 5 failed)
     × the FK artifact exists, is validated, targets auth.users, and deletes with CASCADE
     × REFUSES a profile with no auth.users identity (23503)
     × the production deletion path (GoTrue admin API) empties the whole chain
     × owner SQL deletion cascades too (the fixture path tenancy-style teardown takes)
     × NEGATIVE CONTROL: without the constraint the leak is observable, and rollback un-does it
     ✓ every migration file on disk is recorded as applied by the Supabase CLI (drift-safe)
AssertionError: cascade failed to remove rows from profiles: expected 1 to be +0
```

The message on the production-path failure **is the defect #89 was filed for**, observed live: an
auth user deleted with its profile row left behind (count 1, expected 0). Re-adding the constraint
succeeded *without* a cleanup step — the suite's `afterAll` and the refusal test's self-sweep had
removed every leak it produced, which is also what makes it safe as a mutation-check entry (below).
Restored: **6/6 green**.

## 7. Tracking leg — applied-migration stamp deleted (injected) → RED

`DELETE FROM supabase_migrations.schema_migrations WHERE version='0007'` — simulating "the file
is committed but this database never ran it":

```
× every migration file on disk is recorded as applied by the Supabase CLI (drift-safe)
AssertionError: migrations on disk but never applied to this database: 0007 — the Supabase CLI
applies supabase/migrations/*.sql in filename order; restart the stack or `supabase db reset`:
expected [ '0007' ] to deeply equal []
```

Stamp re-inserted from the captured row; **6/6 green**.

## 8. The cascade itself, with the control in place — no injection needed (observed twice)

The fresh-apply measurement: `npx supabase db reset` on this branch applied `0000`–`0007` in order
and the tracking table recorded all eight (`0004 m1_09_seed_schema_expansion` … `0007
auth_user_cascade`). Post-reset state query: FK `profiles_id_auth_users_fkey` present with
`confdeltype='c'`, `convalidated=true`; orphan profile rows **0** (the pre-reset local database
held **2 026**, which the migration's cleanup class exists for).

Inside `auth-user-cascade.test.ts`, every run also executes its own negative control: in one
rolled-back transaction, the constraint is dropped, a real user deleted, the stranded profile
**seen**, then ROLLBACK un-does everything — the leak and its cure in the same test, STATE §4
item 16.

## 9. The new permanent scripted control — `npm run test:mutation` now carries six controls

The FK mutation became a permanent entry in `scripts/mutation-check.ts` (the scripted form of
entries 6–7). First full run:

```
💥 Breaking: auth->profiles cascade FK dropped (0007 / #89)
✅ CAUGHT   exit=1  Tests  5 failed | 1 passed (6)
✅ RESTORED  exit=0  Tests  6 passed (6)
🎉 All mutation tests PASSED - drift detection catches every violation type!
```

(all six controls CAUGHT; exit 0. Second battery run: identical.)

## 10. A gate caught *me* (incidental, real): `next build` typechecks test files; `vitest run` does not

Battery pass 1's Playwright run died before any spec ran:

```
[WebServer] Failed to type check.
tests/integration/auth-user-cascade.test.ts(179,11): error TS2365: Operator '>' cannot be applied to types 'string | number' and 'number'.
Error: Process from config.webServer was not able to start. Exit code: 1
```

The new cascade suite had compared `pg`'s string-typed `count(*)` with `>` directly. `npm test`
was green on the same file — Vitest transpiles without typechecking; the **production build** is
the gate that enforces types across `**/*.ts` including tests. This is the environment note's
"any TS error makes Playwright fail to start", firing on this branch's own new code, caught by an
existing gate rather than a new one. Fixed with a `Number(...)` conversion; `npm run typecheck`
then 0, both subsequent Playwright runs 61/61.

---

## 11. A Playwright spec went red in pass 2 — `timers.spec.ts:224`, the full event log, reported not smoothed

The pass-1 battery ran twice green **before** the fresh-stack work below; pass 2 then re-ran
everything on the final tree against a database created by a **fresh `supabase start`** (volume
deleted — the CI-parity check from Limits). The first full Playwright attempt on that new database
went **60 passed / 1 failed**:

```
✘  59 tests/e2e/timers.spec.ts:224:3 › session timers › leaves no timer running behind it when the phase advances (17.8s)
    Expected substring: "Stretching"
    Received string:    "2026-09-12 · Resting"
    Timeout: 5000ms
      - waiting for getByTestId('session-subtitle')
        14 × locator resolved to <p data-testid="session-subtitle">2026-09-12 · Resting</p>
```

`:224` is **not** on the documented load-sensitive list (`:277`, `sla.spec.ts:282`). Protocol says
a red *timing* gate gets a solo re-run **before anyone believes it** — it got one, and it
**failed again solo**, immediately after the full suite: same signature, same 5 s window. That is
more than the "green solo" convention assumes, so observation continued: **four more solo runs,
all passed** (22.9 s, then three clean), and **two more full-suite runs passed 61/0** (3.1 m,
3.6 m), Lighthouse 100 again. Nothing was retried *into* a pass without a record — this entry is
the record.

Assessment, stated as what the evidence supports and not more: the signature is the known family
— entry 19 of the M3 audit logged `:277` failing identically (same helper, "advance-phase clicked,
subtitle not yet moved", 14 identical resolutions); every mutation this screen makes is a real
authenticated round trip through `next start` (`WORKOUT_FLOW_TIMEOUT_MS`'s own comment says so),
and the failing expect carries Playwright's **default 5 s** on top of the engine's ~4 s visible
poll — a box still settling from a 61-browser run sits inside that seam. Nothing in this branch
touches the session-phase path, and the same tree ran this spec green in four full-suite runs and
five solo runs. `:224` is **not** added to PROMPTKIT's known-flake list, because that list's claim
is "all green solo", which today's data contradicts — it is recorded here instead, with its one
red solo, and joins the list only if a later checkpoint's greens say so. **No budget moved; no
assertion changed; the red was reported first and explained second.**

---

## Battery, both passes, on the final tree

| Gate | Pass 1 (stack as `db reset` left it) | Pass 2 (fresh `supabase start` DB, CI parity) |
| :--- | :--- | :--- |
| `npm run lint` | 0 errors / 0 warnings | 0 / 0 |
| `npm run typecheck` | exit 0 | exit 0 |
| `./scripts/check-set-config.sh` | clean | clean |
| `git diff --check` | clean | clean |
| `npm test` | **41 files / 408 tests** | **41 / 408** |
| api+security (10 files) | **60 passed / 0 skipped** | **60 / 0** |
| `npm run test:mutation` (6 controls) | exit 0, all 6 CAUGHT | exit 0, all 6 CAUGHT |
| `npx playwright test` | **61/0** and **61/0** (3.2 m each) | **60/1** (:224 — entry 11) → **61/0** (3.1 m) → **61/0** (3.6 m) |
| Lighthouse | 100 all four routes, both runs | 100 all four routes, both clean runs |

The two documented contention specs did **not** fire on any of the five full-suite runs; the
pass-2 red was a *different* spec in the same load-sensitive family, recorded as entry 11 rather
than smoothed into a footnote. D6 fired as usual (`next typegen`/`next:build` rewrote
`tsconfig.json`) and is, by rule (D6), left unstaged.

**Limits of this audit.** (1) Everything DB-shaped was measured on the **local** Supabase stack
(CLI 2.117.0, Postgres 17.6); whether a hosted project's `postgres` role may create an FK into
`auth.users` is **untested** — re-assert at first production migration (STATE §5 already carries
the same caveat for `supautils`-mediated behavior). (2) The CI-parity claim was then measured,
not presumed: after the battery, the project volume was deleted and `npm run db:up` (the exact
CI step: `supabase start` on a fresh volume) re-applied `0000`–`0007` and stamped **all eight**
versions into `supabase_migrations.schema_migrations`, FK present with `confdeltype='c'`,
`convalidated=true` — so entry 7's tracking leg cannot pass in CI while failing locally on
stamping. What remains genuinely unexercised: GoTrue behavior under a **hosted** auth service,
which no local battery can close. (3) GoTrue admin-API user deletion is proven to cascade *on
this stack's GoTrue*.
