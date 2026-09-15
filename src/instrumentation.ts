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

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
