import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EnvValidationError, assertServerEnv } from '../../../lib/env/server';

/**
 * M4-31 (#174 / release blocker B4): the boot must fail naming a missing variable.
 *
 * This is `pk:ship` anti-pattern #1 — "unvalidated environment variables … silent
 * crashes hours after deploy when missing secrets are first accessed". The measured
 * state before this card: no `src/env.ts`, `DATABASE_URL` read lazily inside `getDb()`
 * at `lib/db/client.ts:39`, and `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` read with
 * non-null assertions in `src/middleware.ts` and `lib/supabase/` — `!` erases to no
 * check at all, so a missing anon key surfaced as a runtime throw inside whatever
 * request happened to touch it first.
 *
 * The last case is a *wiring* guard, and it exists for this repo's oldest reason: a
 * module that nothing calls is a file that exists and never executes. #95 found exactly
 * that shape in `sentry.server.config.ts` — imported by nothing, so the sink was a
 * file that never ran. An assertion the boot hook does not call would repeat it.
 */

/** A complete, well-formed environment. Every value is fake. */
const COMPLETE: Record<string, string> = {
  DATABASE_URL: 'postgresql://app_authenticated:pw@127.0.0.1:54322/postgres',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3001',
};

/** A value distinctive enough that finding it in a message is unambiguous. */
const SECRET_SHAPED = 'super-secret-value-8f3c1d9e-must-never-be-printed';

describe('M4-31: startup environment validation', () => {
  it('AC-1: accepts a complete environment and returns the typed values', () => {
    const parsed = assertServerEnv({ ...COMPLETE });
    expect(parsed.DATABASE_URL).toBe(COMPLETE.DATABASE_URL);
    expect(parsed.NEXT_PUBLIC_APP_URL).toBe(COMPLETE.NEXT_PUBLIC_APP_URL);
  });

  it('AC-2: names a missing required variable instead of throwing something vague', () => {
    const withoutDb: Record<string, string> = { ...COMPLETE };
    delete withoutDb.DATABASE_URL;
    let caught: unknown;
    try {
      assertServerEnv(withoutDb);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as Error).message).toContain('DATABASE_URL');
    // A vague failure is the anti-pattern wearing a message: it must be actionable.
    expect((caught as Error).message).not.toMatch(/\brequired\b\s*$/);
  });

  it('AC-3: names every missing variable in a single failure, not just the first', () => {
    let caught: unknown;
    try {
      assertServerEnv({});
    } catch (error) {
      caught = error;
    }

    const message = (caught as Error).message;
    for (const key of Object.keys(COMPLETE)) {
      expect(message, `${key} must be named in one actionable failure`).toContain(key);
    }
  });

  it('AC-4: never prints a value, even one that looks like a secret', () => {
    // The failure that matters most: a validation error that echoes its input turns a
    // boot crash into a credential leak into whatever log platform collected it. So every
    // case here throws, and every case carries a secret-shaped value that must NOT appear
    // in the message — including as an innocent-looking *sibling* of the failing variable,
    // which is the realistic leak (a whole-object dump, not a single echoed field).
    const cases: Array<Record<string, string | undefined>> = [
      // The failing variable is the database URL; the secret rides alongside it.
      { ...COMPLETE, DATABASE_URL: SECRET_SHAPED },
      { ...COMPLETE, DATABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET_SHAPED },
      // A malformed URL fails while the anon key holds the secret.
      { ...COMPLETE, NEXT_PUBLIC_APP_URL: SECRET_SHAPED, NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET_SHAPED },
    ];

    for (const raw of cases) {
      let caught: unknown;
      try {
        assertServerEnv(raw);
      } catch (error) {
        caught = error;
      }
      expect(caught, `expected a failure for ${JSON.stringify(Object.keys(raw))}`).toBeInstanceOf(EnvValidationError);
      expect((caught as Error).message).not.toContain(SECRET_SHAPED);
    }
  });

  it('AC-5: a malformed value names the variable and a reason', () => {
    let caught: unknown;
    try {
      assertServerEnv({ ...COMPLETE, NEXT_PUBLIC_APP_URL: 'not-a-url' });
    } catch (error) {
      caught = error;
    }

    const message = (caught as Error).message;
    expect(message).toContain('NEXT_PUBLIC_APP_URL');
    expect(message.length).toBeGreaterThan('NEXT_PUBLIC_APP_URL'.length + 4);
  });

  it('AC-6: absent optionals are genuinely optional', () => {
    // SENTRY_DSN absent means the sink never initialises — a documented, supported state
    // (sentry.server.config.ts AC-2), not a misconfiguration. So must SENTRY_RELEASE and
    // LOG_LEVEL be.
    expect(() => assertServerEnv({ ...COMPLETE })).not.toThrow();
  });

  it('AC-7: the migration and service-role keys are NOT runtime requirements', () => {
    // Requiring either would break the deploy: migrations run out of band, and the
    // service-role key was verified absent from src/ and lib/ (2026-09-21).
    const parsed = assertServerEnv({ ...COMPLETE });
    expect(parsed).not.toHaveProperty('MIGRATION_DATABASE_URL');
    expect(parsed).not.toHaveProperty('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('reports one reason per variable, not one per failing constraint', () => {
    // Measured defect: `.min(1).url()` emits two issues for an empty string, so the first
    // implementation printed "2 problem(s)" and named DATABASE_URL twice for a single
    // misconfiguration. One variable, one line.
    let caught: unknown;
    try {
      assertServerEnv({ ...COMPLETE, DATABASE_URL: '' });
    } catch (error) {
      caught = error;
    }

    const message = (caught as Error).message;
    expect(message.split('DATABASE_URL').length - 1).toBe(1);
    expect(message).toContain('1 problem');
    expect((caught as EnvValidationError).variables).toEqual(['DATABASE_URL']);
  });

  it('treats an empty string as absent, since an empty variable is a real deployment mistake', () => {
    let caught: unknown;
    try {
      assertServerEnv({ ...COMPLETE, DATABASE_URL: '' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    expect((caught as Error).message).toContain('DATABASE_URL');
  });

  it('AC-8: the boot hook actually calls it, and does not fail the build', () => {
    const source = readFileSync(join(process.cwd(), 'src/instrumentation.ts'), 'utf8');

    // The seam must be invoked, or this whole card is a library nobody uses (#95's shape).
    expect(source, 'instrumentation.ts must call assertServerEnv').toContain('assertServerEnv(');

    // And it must not run during `next build`: a build needs no runtime secret, and
    // failing it would break a fresh clone's first `npm run build`.
    expect(
      source,
      'the build phase must be excluded from the boot assertion',
    ).toContain('phase-production-build');

    // The assertion must *end the process*, not merely complain. Measured: throwing alone
    // left the server alive and answering, which is the anti-pattern this card exists to
    // remove — so the exit is part of the contract, not an implementation detail.
    expect(
      source,
      'a failed boot assertion must exit non-zero, not log and keep serving',
    ).toContain('process.exit(1)');

    // The assertion must run before anything else in the hook that could throw first.
    const assertAt = source.indexOf('assertServerEnv(');
    const sentryAt = source.indexOf("await import('./sentry.server.config')");
    expect(assertAt, 'assertServerEnv must be called').toBeGreaterThan(-1);
    expect(sentryAt, 'instrumentation.ts must still initialise the sink').toBeGreaterThan(-1);
    expect(assertAt, 'the env assertion must precede the sink import').toBeLessThan(sentryAt);
  });
});
