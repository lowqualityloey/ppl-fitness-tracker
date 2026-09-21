/**
 * M4-06 (#95) — Next's instrumentation hook, which is the only thing that makes
 * `sentry.server.config.ts` run.
 *
 * Found by measurement, not by reading the wizard's docs: with the config file present
 * and `SENTRY_DSN` set, a route handler that threw produced a 500 and **no envelope**.
 * The SDK's built-in output contains no reference to `sentry.server.config` at all —
 * the file is not auto-detected, it is *imported*, by this hook. Without it the server
 * half of the sink is a file that exists and never executes, which is the exact shape
 * this repo's "configured vs observed" rule exists to catch.
 *
 * `register()` runs once per server process, before the first request. The Node
 * condition is deliberate: this app's only other runtime is middleware, which sets a
 * header and mints a nonce and reports nothing — an edge config would initialise an
 * SDK no code path in this repo calls.
 */

import * as Sentry from '@sentry/nextjs';
import { assertServerEnv } from '../lib/env/server';
import { log } from '../lib/logger';

/**
 * M4-31 (#174, release blocker B4) — the environment assertion lives here because
 * `register()` is the only code this app runs once per server process **before** the first
 * request. That is exactly the seam a fail-fast check needs: `pk:ship`'s anti-pattern #1 is
 * a missing secret discovered by a user hours after a green deploy, and the measured state
 * before this card was `DATABASE_URL` throwing on the first query, plus two
 * non-null-asserted Supabase variables that were never checked at all.
 *
 * **The build phase is excluded on purpose.** `register()` also runs while `next build`
 * produces the bundle, and a build needs no runtime secret — asserting there would break a
 * fresh clone's first `npm run build`, which is a worse failure than the one being guarded
 * against. `NEXT_PHASE === 'phase-production-build'` is the signal for that phase; every
 * serving phase, dev and production alike, falls through to the assertion.
 *
 * Nothing is validated at module scope, so importing app code in a unit test still requires
 * no environment. Only a booting server does.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      try {
        assertServerEnv(process.env);
      } catch (error) {
        /*
         * **Throwing from here is not enough, and that is measured rather than assumed.**
         * With `DATABASE_URL=` emptied, `next start` logged "Failed to prepare server",
         * logged the unhandled rejection — and then stayed alive and kept serving. The
         * process only died when `timeout` killed it 45 s later (exit 124). That is the
         * original anti-pattern wearing a better message: a box that appears up and
         * answers errors. B4 asks for a process that refuses to come up, so the failure
         * is reported and then the process is ended explicitly.
         *
         * Anything that wants to run *before* this must run above it; nothing in this app
         * should be serving requests on a configuration already known to be broken.
         */
        log.error('refusing to start: invalid environment configuration', { error });
        process.exit(1);
      }
    }
    await import('./sentry.server.config');
  }
}

/**
 * Next's hook for an error it caught *outside* a route handler — a throwing server
 * component or layout, which no `loggedRoute` wrapper is above. Kept because the seam
 * tests cannot cover what never reaches them, and dropping it would leave the pages
 * unreported. A route handler that throws through `loggedRoute` is measured in
 * `tests/e2e/error-sink.spec.ts`'s neighbourhood: the report carries one set of tags,
 * because the reporter marks the error object it has already handed over.
 */
export const onRequestError = Sentry.captureRequestError;
