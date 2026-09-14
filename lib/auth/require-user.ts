import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';
import { AppErrorException, serviceUnavailableError, unauthenticatedError } from '../contracts/envelope';
import {
  createVerifiedUserContext,
  type VerifiedUserContext,
} from '../db/auth-context';
import { attachCorrelation, log } from '../logger';

/**
 * M1-12: The only legitimate source of a user id anywhere in this app.
 *
 * Per Amendment A1.2, application code never calls auth.uid() directly
 * and never decodes a JWT from a cookie by hand — identity comes from
 * this function, which resolves the session via the Supabase SSR server
 * client's auth.getUser(). That call makes a network round trip to
 * GoTrue and validates the token server-side, unlike getSession(),
 * which trusts whatever is in the cookie without asking Auth to confirm
 * it's still good.
 *
 * Deliberately takes no user-supplied identity input — the only
 * parameter is an optional pre-built Supabase client, used exclusively
 * by tests (see tests/integration/require-user.test.ts) to inject a
 * client backed by an in-memory cookie jar instead of next/headers,
 * which throws outside a real request context. Production call sites
 * must never pass this argument; the default createClient() is what
 * actually reads the request's cookies. A user id must never be read
 * from a request body or query param (spec §4.2) — if this function
 * accepted one, that would be the exact hole it exists to close.
 *
 * @throws {AppErrorException} 401-shaped, when no session exists.
 */
export async function requireUserContext(
  client?: SupabaseClient
): Promise<VerifiedUserContext> {
  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.auth.getUser();

  // The verification hop returned an error. We must tell two different
  // outcomes apart (#125):
  //   • A shed hop — the request to GoTrue never completed (transport
  //     error / no HTTP response, status 0), GoTrue shed load (429), or
  //     GoTrue itself is failing (5xx). This is a server-side, retryable
  //     condition → 503 with Retry-After, and we log the cause so the
  //     "1003 rejections, zero recorded causes" mystery cannot recur.
  //   • A genuine auth rejection — GoTrue answered with a 4xx (missing /
  //     expired / invalid token). That is a real "signed out" → 401.
  // Both still fail the request; we only pick the honest status. We never
  // relax verification: an unverified request is rejected either way.
  if (error) {
    const status = error.status ?? 0;
    const hopShed = status === 0 || status === 429 || status >= 500;
    if (hopShed) {
      // M4-05 (#94): this line used to be a `console.error`, which is the one
      // `console.*` call left in `lib/` and the reason #125 could happen — the
      // cause was recorded, but not as anything a log consumer could find by
      // correlation id. The error object is handed to the seam rather than
      // picked apart here, because `sanitize` renders it as
      // `{name, message, errorCode}` and `code` is a reserved word at this
      // boundary: it is the magic-link credential's parameter name
      // (`lib/logger/redact.ts`), so the seam must never learn to tell the two
      // apart at runtime.
      log.error('auth verification hop failed', {
        phase: 'requireUserContext',
        hopShed: true,
        status,
        error,
      });
      throw new AppErrorException(serviceUnavailableError());
    }
    throw new AppErrorException(unauthenticatedError());
  }

  if (!data.user) {
    throw new AppErrorException(unauthenticatedError());
  }

  /*
   * M4-05 (#94): identity stops being unknown to the log at this exact line.
   * Everything below — the repository, the transaction, a rejection three
   * domains away — now writes `user_id` on its lines without being handed a
   * user, which is the "correlation propagation across the getUser hop" the
   * card asks for. It is a no-op when no request scope is active (C1 has not
   * wrapped the route handlers yet; that is #94's next commit), and the seam
   * renders that as `"user_id":null` rather than dropping the key, so the gap
   * is visible in the output instead of being something only the reader of
   * this comment knows about.
   */
  attachCorrelation({ userId: data.user.id });

  return createVerifiedUserContext(data.user);
}

export async function requireUser(
  client?: SupabaseClient
): Promise<{ userId: string }> {
  const { userId } = await requireUserContext(client);
  return { userId };
}
