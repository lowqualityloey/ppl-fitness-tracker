import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';
import { AppErrorException, unauthenticatedError } from '../contracts/envelope';
import {
  createVerifiedUserContext,
  type VerifiedUserContext,
} from '../db/auth-context';

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

  if (error || !data.user) {
    throw new AppErrorException(unauthenticatedError());
  }

  return createVerifiedUserContext(data.user);
}

export async function requireUser(
  client?: SupabaseClient
): Promise<{ userId: string }> {
  const { userId } = await requireUserContext(client);
  return { userId };
}
