import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * M4-00 (#89) / ADR-0006: the migration-authorship guard.
 *
 * The recorded model: **migrations are hand-authored SQL in `supabase/migrations/`, applied by
 * the Supabase CLI in filename order** (`.github/workflows/test.yml` runs `npx supabase start`).
 * drizzle-kit's `generate`/`migrate` are retired because their journal (`meta/_journal.json`)
 * omitted three shipped files, was ignored by the applier, and a measured run of
 * `npm run db:generate` on 2026-09-12 emitted a phantom second `0004` of destructive DDL from a
 * stale snapshot **with exit 0** — evidence quoted in ADR-0006.
 *
 * This file is the merge gate against re-introduction. Every assertion below corresponds to one
 * leg of that trap, and every leg was watched to go RED with the violation injected — see
 * `docs/tests/2026-09-12-m4-089-break-each-gate-audit.md`. A control never observed failing is
 * not a disarmed one (STATE §4 item 11/16).
 *
 * Deliberately hermetic: reads only tracked files, no sockets — this is the fastest place the
 * discipline can bite.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

/** Strip block and line comments so assertions read code, not prose about the trap. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('M4-00: migration authorship model (ADR-0006) — merge gate', () => {
  it('exposes no npm script that runs drizzle-kit (db:generate/db:migrate are retired)', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const offenders = Object.entries(pkg.scripts ?? {})
      .filter(([, command]) => command.includes('drizzle-kit'))
      .map(([name]) => name);
    expect(
      offenders,
      `drizzle-kit must not be reachable via npm scripts (ADR-0006: migrations are ` +
        `hand-authored; db:generate reasoned from a stale journal and emitted a phantom ` +
        `destructive migration with exit 0). Offending scripts: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('drizzle.config.ts declares no `out:` and never names supabase/migrations in code', () => {
    const config = withoutComments(readFileSync(path.join(ROOT, 'drizzle.config.ts'), 'utf8'));
    expect(
      /\bout\s*:/.test(config),
      'drizzle.config.ts must not set `out:`. With out unset, generate falls back to the ' +
        'gitignored ./drizzle/ scratch (measured 2026-09-12); with out pointing at ' +
        'supabase/migrations the stale-journal trap is back (ADR-0006).',
    ).toBe(false);
    expect(config).not.toContain('supabase/migrations');
  });

  it('leaves no drizzle journal behind inside supabase/migrations', () => {
    const metaDir = path.join(MIGRATIONS_DIR, 'meta');
    expect(
      existsSync(metaDir),
      'supabase/migrations/meta/ must not exist. A journal that lists only some shipped ' +
        'files is the mixed-authority lie D4 recorded; drizzle-kit recreates it the moment ' +
        'generate points here again, and the Supabase CLI ignores it either way (ADR-0006).',
    ).toBe(false);
  });

  it('migration files obey the filename contract the applier depends on', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(7); // 0000–0006 shipped before #89; 0007+ after

    const violations: string[] = [];
    let expectedIdx = 0;
    for (const file of files.sort()) {
      const match = /^(\d{4})_([a-z0-9][a-z0-9_]*)\.sql$/.exec(file);
      if (!match) {
        violations.push(`${file}: not NNNN_snake_case.sql`);
        continue;
      }
      const idx = Number(match[1]);
      if (idx !== expectedIdx) {
        violations.push(`${file}: version ${idx} breaks contiguity (expected ${expectedIdx})`);
      }
      expectedIdx = idx + 1;
    }
    expect(
      violations,
      'The Supabase CLI applies supabase/migrations/*.sql in filename order and tracks them ' +
        'by 4-digit version. Duplicate, gapped, or mis-named files make "what is applied" ' +
        'depend on parser luck. Add the NEXT contiguous number, hand-authored (ADR-0006).',
    ).toEqual([]);
  });
});
