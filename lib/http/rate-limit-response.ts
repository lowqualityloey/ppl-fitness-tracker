import { NextResponse } from 'next/server';
import { appErrorEnvelope, rateLimitedError } from '../contracts/envelope';
import type { AuthRateLimiter } from '../auth/rate-limit';

/**
 * M2-06 (#42): one shape for "slow down", shared by every limiter.
 *
 * Each route previously assembled its own 429 — envelope, status, `Retry-After` —
 * which is three things per call site that can silently disagree with the others.
 * A limiter whose `Retry-After` header contradicts the message body, or a route
 * that returns 429 in the body and 200 on the wire, is exactly the kind of drift
 * a second consumer introduces.
 *
 * Returns `null` when the request is allowed, so the call site reads as a guard
 * clause rather than a nested conditional.
 *
 * The `subject` argument is a fixed word chosen by the caller (`'sync'`,
 * `'import'`), never request data: it appears in the message the client sees,
 * and echoing anything user-controlled into an error body is a disclosure habit
 * worth not starting here.
 */
export function rateLimitedResponse(
  limiter: AuthRateLimiter,
  key: string,
  subject: string,
): NextResponse | null {
  const decision = limiter.check(key);
  if (decision.allowed) return null;

  const error = rateLimitedError(
    `Too many ${subject} requests. Try again in ${decision.retryAfterSeconds} seconds.`,
  );
  const response = NextResponse.json(appErrorEnvelope(error), { status: error.status });
  response.headers.set('Retry-After', String(decision.retryAfterSeconds));
  return response;
}
