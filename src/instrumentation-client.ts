/**
 * M4-06 (#95) — the browser half of the error sink, and the only place the client
 * talks to Sentry.
 *
 * Two decisions here are the card's, not the SDK's:
 *
 * - **Errors only.** `tracesSampleRate` is not set at all, which is the strongest form
 *   of the deferral: `DEFERRED-m4-005` re-opens *when G-M3-2's p95 misses three
 *   consecutive weekly reports*, and the card that re-opens it should add the option,
 *   not edit a number back to 0. `tests/unit/infra/sentry-config.test.ts` fails any
 *   file in this pair that mentions a trace rate.
 * - **No DSN is a supported configuration, and it is not "Sentry, but quieter".** With
 *   no DSN this module returns before the SDK exists and installs no transport, so
 *   `reportError` short-circuits at one branch. A half-initialised SDK — initialised
 *   without a DSN, queueing envelopes at a sink that cannot receive them — is exactly
 *   the "telemetry absence becomes an outage" shape AC-2 refuses.
 *
 * The read of `process.env.NEXT_PUBLIC_SENTRY_DSN` is a *literal member expression*
 * on purpose: that is the shape Next's bundler inlines into the client bundle. Bind it
 * to a parameter first and the value disappears at build time, which is the failure
 * mode `lib/auth/magic-link.ts`'s `NEXT_PUBLIC_APP_URL` check documents and #142's CI
 * gap re-proved.
 *
 * What the SDK asks for and this file declines, on purpose: at this pin the build prints
 * "ACTION REQUIRED … export `onRouterTransitionStart`" to instrument *navigations*. That
 * is a tracing hook, and `DEFERRED-m4-005` put navigation and field-performance signal
 * outside this card — the same boundary that keeps `tracesSampleRate` out of the options
 * below, and asserted as a guard in `tests/unit/infra/sentry-config.test.ts` so the
 * "action required" line cannot be satisfied by a well-meaning future edit. The warning
 * is expected output; the sink is errors-only by decision, not by oversight.
 *
 * Ingest is same-origin: `next.config.ts` sets `tunnelRoute`, so envelopes POST to
 * `/monitoring` and Next rewrites them onward. That is what lets `connect-src` stay
 * `'self'` (M4-24's rule 3), and the all-page-types sweep in `tests/e2e/csp.spec.ts`
 * is the guard — a regression to direct ingest shows up there as a violation, not as a
 * silently lost event.
 */

import * as Sentry from '@sentry/nextjs';
import { resolveRelease, setErrorTransport } from '../lib/errors/reporter';
import { createSentryTransport } from '../lib/errors/sentry-transport';

/** Inlined by the bundler; do not compute it. */
const BROWSER_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Returns whether the sink came up, which is the assertion the config test makes.
 * Exported as a function rather than left as module side effects so a spec can call it
 * with and without a DSN and assert what got installed.
 */
export function initSentryBrowser(dsn: string | undefined = BROWSER_DSN): boolean {
  if (dsn === undefined || dsn.trim() === '') return false;

  const release = resolveRelease();
  Sentry.init({
    dsn,
    // Spread rather than `release: resolveRelease() ?? undefined`: passing the key with
    // an undefined value *is* an answer, and it overrode the release the build injected
    // for the client bundle (measured — the envelope arrived with `release: null`).
    // Absent means "SDK, use what you detected", which is the point of `next.config.ts`'s
    // `release.name` at this pin.
    ...(release === null ? {} : { release }),
    // Personal-data app: no cookies, no request headers, no IP on an event.
    sendDefaultPii: false,
  });

  setErrorTransport(
    createSentryTransport((error, hint) => {
      Sentry.captureException(error, hint);
    }),
  );
  return true;
}

initSentryBrowser();
