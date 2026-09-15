/**
 * M4-06 (#95) — the server half of the reporting seam.
 *
 * Split from `reporter.ts` for one mechanical reason: the correlation id lives in an
 * `AsyncLocalStorage` (`lib/logger/context.ts`), and anything that imports that module
 * pulls `node:async_hooks` into its bundle — which a client component must not do. So
 * the browser reports through `reporter.ts` and hands over no correlation, while
 * everything on this side of the wire gets the same id its log lines carry, without a
 * call site having to remember to ask for it. That is the G-M4-2 spine — *one id from a
 * client tap through the route line to the Sentry event* — enforced by structure rather
 * than by diligence, which is how #94 made the same argument for `loggedRoute`.
 *
 * It also installs the logging seam as the listener for a transport that throws: on the
 * server there is somewhere to say it, and the alternative — silence — is #125's
 * complaint wearing a new costume.
 */

import { currentCorrelation, log } from '../logger';
import {
  reportError,
  setMissingTransportListener,
  setTransportFailureListener,
  type ErrorReport,
} from './reporter';

let listenersInstalled = false;

/** Install once per process; the identity of the listener never changes after that. */
function ensureTransportFailureLogged(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;
  // "The sink was never installed" is the one failure this seam cannot see from the
  // inside: with no transport, `reportError` is a branch and the app answers 500s
  // forever with no events and no error. So the server says it out loud, once, on the
  // log line that proves the report was attempted — the tripwire the API-live spec
  // asserts against, because a bundle-graph mistake is invisible anywhere else.
  setMissingTransportListener((report) => {
    if (reportedMissing) return;
    reportedMissing = true;
    log.warn('error report had no transport installed', {
      source: report.source,
      plane: report.plane,
    });
  });
  setTransportFailureListener((transportError, original) => {
    log.error('error transport threw', {
      error: transportError,
      originalErrorName: original instanceof Error ? original.name : typeof original,
      originalErrorMessage: original instanceof Error ? original.message : String(original),
    });
  });
}

let reportedMissing = false;

/**
 * Report a server-side defect with the current request's correlation attached.
 *
 * `report.source` is required for the same reason every log message here is a sentence:
 * "server error" is not a search result. Call sites pass the route they were serving
 * (`'POST /api/sync'`) or the seam that saw it (`'route-error:unhandled'`).
 */
export function reportServerError(error: unknown, report: ErrorReport): void {
  ensureTransportFailureLogged();
  reportError(error, {
    ...report,
    plane: 'server',
    // A caller may pass an explicit correlation (a worker outside any request scope);
    // otherwise this is the request's own, which is the whole point of the wrapper.
    correlation: report.correlation ?? currentCorrelation(),
  });
}
