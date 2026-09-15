/**
 * M4-06 (#95) — the server half of the error sink.
 *
 * Same two rules as `instrumentation-client.ts`: errors only (`tracesSampleRate` is
 * never set, per `DEFERRED-m4-005`), and an absent DSN means the SDK is never
 * initialised and no transport is installed — `reportServerError` then costs one
 * branch, and a request that fails on a box with no telemetry still answers its 500
 * and still writes its log line, which is AC-2's actual claim.
 *
 * Why this file reads `process.env` normally and the client file does not: the server
 * bundle is evaluated at runtime, so the DSN can arrive from the deployment
 * environment; the browser's copy is baked at build. Both names live in `.env.example`,
 * and the asymmetry is why there are two.
 *
 * The server SDK's own auto-instrumentation wraps route handlers, so a throw can reach
 * Sentry *without* `reportServerError`. That is not a second channel to keep in sync —
 * the reporter marks the error object, and Sentry's `beforeSend` does not dedupe on it
 * — it is a reason the tags this transport attaches (`kind`, `source`) are the ones a
 * reviewer greps for: an untagged event is the SDK's own capture, a `kind:producer`
 * event is this app's judgement that the defect is ours.
 */

import * as Sentry from '@sentry/nextjs';
import { resolveRelease, setErrorTransport } from '../lib/errors/reporter';
import { createSentryTransport } from '../lib/errors/sentry-transport';

/** Returns whether the sink came up — the assertion the config test makes. */
export function initSentryServer(dsn: string | undefined = process.env.SENTRY_DSN): boolean {
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
    sendDefaultPii: false,
  });

  setErrorTransport(
    createSentryTransport((error, hint) => {
      Sentry.captureException(error, hint);
    }),
  );
  return true;
}

initSentryServer();
