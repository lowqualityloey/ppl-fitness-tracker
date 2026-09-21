import { z } from 'zod';

/**
 * M4-31 (#174 / release blocker B4): fail-fast server environment validation.
 *
 * ## What this is for
 *
 * `pk:ship` anti-pattern #1 is "unvalidated environment variables — silent crashes hours
 * after deploy when missing secrets are first accessed". Before this module the measured
 * state was exactly that:
 *
 * - `DATABASE_URL` was read lazily inside `getDb()` (`lib/db/client.ts:39`), so a missing
 *   value threw on the **first query** rather than at boot.
 * - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` were read with non-null
 *   assertions in `src/middleware.ts` and `lib/supabase/{server,cookie-jar}.ts`. A `!`
 *   erases to no check at all, so a missing key surfaced as a throw inside whichever
 *   request happened to touch Supabase first — possibly hours after a green deploy.
 *
 * ## The required set is derived, not guessed
 *
 * Every `process.env` read in `lib/` and `src/` was censused (2026-09-21) before this
 * schema was written. Four names are genuinely needed to serve a request; the rest are
 * optional by design and demanding them would break the deploy:
 *
 * - `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` absent means the sink never initialises —
 *   a documented, supported state (`sentry.server.config.ts`), not a misconfiguration.
 * - `SENTRY_RELEASE` / `NEXT_PUBLIC_SENTRY_RELEASE` are build-injected attribution.
 * - `LOG_LEVEL` falls back to the logger's own default.
 * - `MIGRATION_DATABASE_URL` is **not** a runtime variable (migrations run out of band),
 *   and `SUPABASE_SERVICE_ROLE_KEY` was verified absent from `src/` and `lib/` — it lives
 *   in `.env.example` and test fixtures only. Requiring either would break production.
 *
 * ## Two rules this module keeps deliberately
 *
 * **It never echoes a value.** The failure message is built from the variable *name* and a
 * reason derived from the issue *code* — never from `issue.message`, which a future custom
 * message could interpolate a value into, and never from the raw input. A validation error
 * that prints its input turns a boot crash into a credential leak into whatever log
 * platform collected it.
 *
 * **It reports every problem at once.** A boot that names one missing variable, is fixed,
 * and names the next is a deploy loop; the operator gets the whole list in one failure.
 *
 * This module is import-safe: nothing happens at import time, so the ~65 unit files that
 * import app code without a full environment are unaffected. The boot hook
 * (`src/instrumentation.ts`) is what calls the assertion.
 */

/**
 * The variables a server process needs in order to serve a request.
 *
 * `z.string().min(1)` before `.url()` on purpose: an **empty string counts as absent**,
 * because that is what a real deployment mistake looks like — a variable present in the
 * dashboard with no value. `z.object` (not `.strict()`) because the raw input is all of
 * `process.env`; undeclared keys are stripped, which is also what makes AC-7 hold —
 * `MIGRATION_DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` cannot appear in the result.
 */
export const ServerEnvSchema = z.object({
  DATABASE_URL: z.string().min(1).url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1).url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().min(1).url(),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * A boot failure that is safe to print. `variables` is exposed so a caller (or a test)
 * can assert on the names without parsing the message.
 */
export class EnvValidationError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[], details: readonly string[]) {
    super(
      `Invalid environment configuration — ${details.length} problem(s) must be fixed before this process can serve requests:\n`
        + details.map((detail) => `  - ${detail}`).join('\n'),
    );
    this.name = 'EnvValidationError';
    this.variables = variables;
  }
}

/**
 * Turn a Zod issue into a human reason **without ever touching the value**.
 *
 * Keyed off `issue.code` rather than `issue.message`, and off the raw input only to
 * distinguish "absent" from "present but wrong" — an existence check, not a read of the
 * content. Unknown codes fall back to a generic reason rather than risk an interpolated
 * message leaking through.
 */
function reasonFor(issue: z.core.$ZodIssue, raw: Record<string, string | undefined>): string {
  const name = issue.path.join('.');
  const value = raw[name];

  if (value === undefined) return 'is missing';
  if (value === '') return 'is present but empty';
  if (issue.code === 'invalid_format') return 'is present but not a valid URL';
  if (issue.code === 'invalid_type') return 'is present but not a string';
  return 'is present but invalid';
}

/**
 * Validate an environment object, throwing `EnvValidationError` if it cannot serve
 * requests. Pure: takes the environment as an argument, so it is testable without
 * mutating `process.env` and cannot be defeated by module-load ordering.
 */
export function assertServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  // One line per *variable*, not one per failing constraint. Measured: an empty
  // `DATABASE_URL` fails both `.min(1)` and `.url()`, so a naive loop reported
  // "2 problem(s)" and printed `DATABASE_URL` twice for a single misconfiguration —
  // a confusing failure at exactly the moment the operator has the least patience.
  // First issue wins, which is also the most specific reason ("present but empty"
  // rather than the generic URL complaint).
  const reasons = new Map<string, string>();
  for (const issue of parsed.error.issues) {
    const name = issue.path.join('.') || '(environment)';
    if (!reasons.has(name)) reasons.set(name, `${name} ${reasonFor(issue, raw)}`);
  }

  const variables = [...reasons.keys()];
  throw new EnvValidationError(variables, [...reasons.values()]);
}
