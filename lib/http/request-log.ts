/**
 * M4-05 (#94): the handler-top request scope every route exports through.
 *
 * `lib/logger/context.ts` explains why the scope is a handler-top continuation
 * and not middleware; this file is the single place that shape is applied, so
 * a handler cannot enter a request without also entering its scope, its
 * correlation fields, and its completion line. It is a wrapper rather than a
 * per-route `withRequestScope(() => …)` for the same reason `withUser()` is:
 * the discipline of remembering to call the helper at the right place in
 * eleven files is the discipline that decays silently, and the route-scope
 * guard (`tests/unit/api/route-scope.test.ts`) fails a new handler that skips
 * it.
 *
 * What each wrapped request emits at `info`: one JSON line with method, path,
 * status, and duration, carrying the id every line beneath it also carries.
 * One line at completion rather than one at entry and one at exit: the entry
 * line's whole information is method+path, which is a subset of the completion
 * line's, and a request that hangs is visible as the absence of the line the
 * load harness (#90) already counts on.
 *
 * The `error` fields go to the seam unpicked-apart: `redact.ts` decides what a
 * line may carry, and a cause that dies on a status page must still die in the
 * log with its name and message (`#125`'s whole complaint was the reverse —
 * the answer kept, the cause discarded).
 */

import { log, withRequestScope } from '../logger';

export function loggedRoute<A extends readonly unknown[], R extends Response>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    // Next passes the Request as the first argument to every handler, even the
    // ones that declare no parameters (profile's GET). The wrapper sees the
    // call site's actual arguments, so the entry line is not a per-route
    // obligation — but read it as `unknown`: the generic says nothing about
    // what is in slot 0.
    const candidate: unknown = args[0];
    const route =
      candidate instanceof Request
        ? { method: candidate.method, path: new URL(candidate.url).pathname }
        : {};
    const startedAt = performance.now();

    return withRequestScope(async () => {
      try {
        const response = await handler(...args);
        log.info('request completed', {
          ...route,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return response;
      } catch (error) {
        log.error('request threw', {
          ...route,
          durationMs: Math.round(performance.now() - startedAt),
          error,
        });
        throw error;
      }
    });
  };
}
