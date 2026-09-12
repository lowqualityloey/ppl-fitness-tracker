# Architectural Decision Record (ADR): Migrations Are Hand-Authored; drizzle-kit Stays Out of the Migration Loop

- **Status**: Accepted — decided and implemented 2026-09-12 by M4-00 (#89)
- **Deciders**: Repository owner, Agent (DSH)
- **Date**: 2026-09-12
- **Technical Story**: `docs/STATE.md` §5 debt item D4 (from the 2026-09-11 intake), `PROMPTKIT.md` §3 mixed-authority warning, issue #89 (M4-00, p0 — the gate M4-20/M4-21 and any cascade migration sit behind)

---

## Context and Problem Statement

`supabase/migrations/` is where every schema change to this app ships, and until this ADR two
machineries claimed it with different books of record:

- **The apply machinery is the Supabase CLI.** CI runs `npx supabase start`
  (`.github/workflows/test.yml`), which applies `supabase/migrations/*.sql` **in filename order**
  and records applied versions in `supabase_migrations.schema_migrations`. It does not read
  drizzle's `meta/_journal.json` at all.
- **The generation machinery was drizzle-kit.** `drizzle.config.ts` set `out: './supabase/migrations'`
  and `npm run db:generate` / `db:migrate` wrapped `drizzle-kit`. But `meta/_journal.json` records
  only `0000`–`0003` (and only two of those four have snapshot files — `0001` and `0003` were
  hand-edited out of having valid drizzle state), while `0004`–`0006` shipped hand-authored and
  unjournalled. `drizzle.__drizzle_migrations` on the live database is **empty**: `db:migrate`
  never successfully migrated anything here. The journal's authority was decorative.

That is debt item D4, and the card that closes it asks one question: *which model do we record*,
because every schema-touching M4 card inherits the answer.

**The trap was watched, not imagined.** On 2026-09-12, against `origin/main` (`793db53`) with the
stack up and no pending schema intent — just `npm run db:generate`:

```
[✓] Your SQL migration file ➜ supabase/migrations/0004_warm_ozymandias.sql 🚀
```

exit 0. It computed a diff from the stale `0002` snapshot plus current `db/schema/index.ts` and:

- emitted `0004_warm_ozymandias.sql` — a **second `0004`**, colliding with the version prefix of the
  applied `0004_m1_09_seed_schema_expansion.sql`, containing 28 DDL statements including
  `CREATE TABLE "sync_changes"` and `"sync_entity_versions"` (already shipped by hand-authored
  `0006`), `DROP INDEX "routine_exercises_day_order"` (shipped by `0000`), and
  `ALTER COLUMN target_sets DROP NOT NULL` (relaxed by `0004`);
- **rewrote `meta/_journal.json`**, recording its phantom as `idx: 4, tag: "0004_warm_ozymandias"` —
  so the journal's `0004` and the directory's `0004` became two different files;
- never mentioned that three sibling migration files exist that it could not see.

Had that file been committed and CI re-run `supabase start` on a fresh database, the phantom would
have executed version-`0004` DDL against a database whose real `0004`–`0006` had already landed —
`CREATE TABLE sync_changes` fails (already exists) on a fresh reset, or silently double-applies the
nullable relaxations on any partially-matching database. This is the failure the intake recorded:
*"`drizzle-kit generate` reasons from a stale snapshot"* — now with the receipt.

## Decision Drivers

- **The model must match the machinery that actually applies the schema.** A journal the applier
  ignores cannot be "authoritative" in any operational sense.
- **drizzle-kit's snapshot format cannot represent what ships here.** Migration `0001` creates a
  role with a password literal, a `SECURITY DEFINER` function, a trigger on `auth.users`, and
  `GRANT`s; `0004`/`0005` carry seed DML; `0002`/`0003` carry RLS policies. None of that is
  drizzle-schema-representable. Model (a) ("record `0004`–`0006` into the journal and prove a
  generate emits an empty diff") therefore requires **fabricating** snapshot JSON that drizzle will
  later trust as ground truth — moving the trap from "visible stale journal" to "invisible plausible
  baseline", where a subtly wrong hand-crafted snapshot makes the *next* generate emit destructive
  diffs with a green empty-diff proof behind it. That trades a loud failure for a quiet one.
- **Honesty law** (`AGENTS.md`): the record must describe what exists. What exists is hand-authored
  SQL applied by the Supabase CLI in filename order.
- **The next schema card must need no archaeology** (#89 AC 3): one paragraph, one guard.

## Considered Options

1. **Journal-authoritative (model a).** Record `0004`–`0006` in `meta/_journal.json`, author the
   missing snapshots, keep `out: './supabase/migrations'`. **Rejected**: requires fabricating drizzle
   state it cannot regenerate honestly; the apply machinery ignores the journal anyway; the
   empty-diff proof it promises proves fidelity to a fiction.
2. **Hand-authored (model b).** Hand-written, idempotency-guarded SQL files in filename order are
   the only migration currency; drizzle-kit does not write into that directory. **Chosen.**
3. **Adopt the Supabase CLI's own toolchain fully** (`supabase db diff` + `db push`, drop drizzle
   metadata entirely from the repo). Rejected as *this* card's scope: `db diff` needs a shadow-database
   flow and the CLI's `supabase_migrations` tracking is already inconsistent locally (only
   `0000`–`0003` recorded despite all seven files applied); changing the apply path is a bigger
   decision than recording the authorship path, and #89's cards don't need it. drizzle-orm (runtime)
   stays; only drizzle-kit's write path is retired.

## Decision Outcome

**Option 2 — hand-authoring is authoritative, and the trap is removed at the mechanism, not the
comment.** Concretely:

1. `package.json` loses `db:generate` and `db:migrate`. A removed script fails loudly
   (`Missing script`); a config comment does not.
2. `drizzle.config.ts` drops `out` entirely, keeping `schema:` and `dbCredentials:` so
   read-only introspection (`drizzle-kit pull`) still works. Measured: with no `out`,
   `drizzle-kit generate` falls back to `./drizzle/` — now gitignored scratch, *nowhere near*
   the applied chain, which is exactly the outcome #89's acceptance criterion names ("refuses or
   writes nowhere near supabase/migrations").
3. `supabase/migrations/meta/` is deleted. It was drizzle's bookkeeping claiming `0000`–`0003`
   were journalled while `0001`/`0003` lacked the snapshots their entries require — the physical
   form of the mixed-authority lie. (Git history preserves it; recoverability is `git show`.)
4. **`tests/unit/migration-authority.test.ts` is the CI gate.** It asserts: no npm script mentions
   `drizzle-kit`; the config names no `out` (and none pointing at `supabase/migrations`);
   `supabase/migrations/meta/` does not exist; every migration file matches the
   `NNNN_snake_case.sql` contract, with unique, contiguous version prefixes starting at `0000`.
   Re-introduction of the trap in any of its four observed forms is a red build.
5. `PROMPTKIT.md` §3 records the model in one paragraph (the M4-20 archaeology-killer), and
   `docs/STATE.md` §4 gains the invariant and §5 closes D4.

**Convention for every future migration** (this is what M4-20/#109 reads before touching SQL):
next contiguous prefix; `-- <milestone>: <intent>` header like `0001`–`0006`; idempotent DDL
(`IF NOT EXISTS` / `DO $$` guards) because `supabase db reset` re-applies the whole chain; Expand →
Backfill/Read-Switch → Contract per STATE §4 item 12; RLS on every new/changed table per item 6,
which `schema-drift.test.ts` enforces; a live-DB integration test that **executes** the artifact,
not a snapshot that trusts it.

### Positive Consequences

- `npm run db:generate` cannot emit a migration from a stale snapshot — the command is gone, the
  config cannot point at the directory, and CI fails if anyone restores either.
- One apply model, one book: `supabase start` / `db reset` in filename order. The phantom-`0004`
  class of collision is structurally impossible, not discouraged.
- The next schema-touching card starts from a paragraph and a failing-on-violation test.

### Negative Consequences & Trade-Offs

- **drizzle-kit's generate-time guardrail (schema TS ↔ emitted SQL) is gone.** `db/schema/index.ts`
  is now only a *type view* of the database; nothing auto-checks it against reality. What actually
  catches drift today: the RLS-shape drift test, the constraint/index tests that query live
  catalogs, and the repository-layer integration suites that write/read every column. Typed row
  reads (D7/#97) harden that further; if column-level drift between schema TS and SQL ever bites,
  the honest fix is a `drizzle-kit pull`-into-scratch *diff check*, explicitly never writing back.
- Hand-authored SQL is hand-reviewed SQL: more discipline per migration, less tool assistance.
- Removing `meta/` discards drizzle's incremental-diff capability; regenerating it (under a
  future reversal of this ADR) means `db:pull` introspection, not archaeology from the stale
  journal.

## Links & References

- Issue #89 (M4-00), `docs/tasks/m4/M4-00-migration-authorship.md` (lands via PR #113)
- `docs/STATE.md` §5 D4 (closed by this decision), §4 item 25, §7 item 5
- `docs/tests/2026-09-12-m4-089-break-each-gate-audit.md` — every gate above watched to fail
- ADR-0003 (what the migration loop must preserve: role, policies, grants)
- ADR-0002 (identity: `profiles.id` **is** `auth.users.id` — the invariant #89's companion
  migration `0007` makes physically true with the auth-FK cascade)
