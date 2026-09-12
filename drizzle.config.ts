import { defineConfig } from 'drizzle-kit';

/**
 * M4-00 (#89) / ADR-0006: migrations are HAND-AUTHORED.
 *
 * There is deliberately **no `out:`** in this config. `drizzle-kit generate` computes its diff
 * from `meta/_journal.json`, and with `out: './supabase/migrations'` here it was measured
 * (ADR-0006, "the trap was watched") emitting a phantom second `0004` of destructive DDL from a
 * stale snapshot while the Supabase CLI — the machinery that actually applies
 * `supabase/migrations/*.sql`, in filename order — never reads that journal at all.
 * `package.json` no longer exposes `db:generate`/`db:migrate` either.
 *
 * `schema:` and `dbCredentials:` remain so read-only introspection (`drizzle-kit pull`) still
 * works. With no `out:` here, `drizzle-kit generate` falls back to `./drizzle/` — gitignored
 * scratch, nowhere near the applied chain (measured 2026-09-12). If you add `out:` back pointing
 * at `supabase/migrations`, or restore a drizzle-kit npm script,
 * `tests/unit/migration-authority.test.ts` fails CI — read ADR-0006's "Convention for every
 * future migration" section first. Runtime code keeps using drizzle-orm; this file governs
 * drizzle-KIT only.
 */
export default defineConfig({
  schema: './db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    // Owner-only (STATE §4 item 18): migration-time tooling URL, never runtime.
    url: process.env.MIGRATION_DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
