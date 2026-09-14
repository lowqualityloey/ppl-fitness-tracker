import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { requireUser, requireUserContext } from '../../lib/auth/require-user.js';
import { AppErrorException } from '../../lib/contracts/envelope.js';
import { setLogSink } from '../../lib/logger/index.js';
import { CookieJar, createClientFromCookieJar } from '../../lib/supabase/cookie-jar.js';

/**
 * M1-12: requireUser() regression tests.
 *
 * requireUser() calls Next.js's cookies() internally, which throws
 * outside a real request context (Next.js only sets up the required
 * AsyncLocalStorage during actual middleware/route-handler execution —
 * confirmed by hand, there's no supported way around it in a bare
 * script). So these tests inject a Supabase client backed by an
 * in-memory CookieJar instead of exercising cookies() directly.
 *
 * This still tests the real thing that matters: a real GoTrue sign-in
 * writes real session cookies via @supabase/ssr's setAll(), and
 * requireUser() resolves the correct user from a client reading those
 * same cookies back — the exact round trip a real request goes through,
 * just without an HTTP server and Next.js's request-scoped cookies() in
 * the loop. Only the cookie *transport* is swapped; the client
 * construction (lib/supabase/server.ts), requireUser()'s logic, and the
 * live call to GoTrue's /auth/v1/token and auth.getUser() are all real.
 */

// Local Supabase credentials (shared defaults, safe to inline — same as
// other integration tests in this repo, e.g. rls-content-tables.test.ts)
const SUPABASE_API_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_PASSWORD = 'test-password-m1-12';
const TEST_EMAIL = 'require-user-a@example.com';

describe('M1-12: requireUser()', () => {
  let ownerClient: Client;
  let userId: string;

  beforeAll(async () => {
    ownerClient = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await ownerClient.connect();
    await cleanupTestUser();

    const created = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
    });

    if (!created.ok) {
      throw new Error(`GoTrue createUser failed (${created.status}): ${await created.text()}`);
    }

    const user = (await created.json()) as { id: string };
    userId = user.id;
  });

  afterAll(async () => {
    await cleanupTestUser();
    await ownerClient.end();
  });

  async function cleanupTestUser(): Promise<void> {
    await ownerClient.query(`DELETE FROM auth.users WHERE email = $1`, [TEST_EMAIL]);
  }

  /** Signs in for real via @supabase/ssr, returning a jar carrying the resulting session cookies. */
  async function signInToJar(): Promise<CookieJar> {
    const jar = new CookieJar();
    const supabase = createClientFromCookieJar(jar);

    const { error } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (error) {
      throw new Error(`signInWithPassword failed: ${error.message}`);
    }

    return jar;
  }

  it('Scenario 1: resolves the correct userId from a real session cookie', async () => {
    const jar = await signInToJar();

    // Simulate a later request: a fresh client reading back the cookies
    // the sign-in wrote, exactly like requireUser()'s real createClient()
    // reads request.cookies rather than reusing the client that signed in.
    const requestClient = createClientFromCookieJar(jar);

    const result = await requireUser(requestClient);

    expect(result.userId).toBe(userId);
  });

  it('Scenario 2: throws a 401-shaped AppError when there is no session', async () => {
    const emptyJar = new CookieJar();
    const requestClient = createClientFromCookieJar(emptyJar);

    await expect(requireUser(requestClient)).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(AppErrorException);
      const appError = (err as AppErrorException).appError;
      expect(appError.status).toBe(401);
      expect(appError.code).toBe('UNAUTHENTICATED');
      return true;
    });
  });

  it('Scenario 3: cannot be spoofed by a request-body userId — only the real session counts', async () => {
    const jar = await signInToJar();
    const requestClient = createClientFromCookieJar(jar);

    // requireUser() takes no identity-bearing arguments at all — there
    // is no parameter through which a caller could pass a spoofed
    // userId even if a handler naively forwarded one from a request
    // body. This test exists to make that structural guarantee explicit:
    // resolving via the real cookie-backed session always wins,
    // regardless of what a malicious body might have claimed.
    const spoofedBody = { userId: '00000000-0000-0000-0000-000000000000' };
    const result = await requireUser(requestClient);

    expect(result.userId).toBe(userId);
    expect(result.userId).not.toBe(spoofedBody.userId);
  });

  it('Scenario 4 (control): a shed verification hop MUST surface as 503, NOT 401, and log the cause', async () => {
    // A Supabase client whose auth verification hop fails (e.g. a network
    // blip or a GoTrue 5xx). This is a server-side condition, not an auth
    // rejection, so the mapping must be 503 SERVICE_UNAVAILABLE with a
    // Retry-After — never 401. The control below proves the test is alive:
    // if requireUserContext ever maps a hop failure to 401, this test goes
    // red, forcing the off-the-table direction to be re-litigated.
    const failingClient = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: 'network timeout', status: 0, code: 'network_error' },
        }),
      },
    } as unknown as SupabaseClient;

    // M4-05 (#94) moved this line's channel from `console.error` to the seam,
    // so the assertion moved with it: `setLogSink` is the seam's injection
    // point, and asserting through it proves both halves at once — the cause
    // is logged *and* it reaches the log as a structured line (a console spy
    // would now sit in front of a method the production path never calls).
    const lines: Array<{ level: string; msg: string }> = [];
    const restoreSink = setLogSink((_line, entry, level) =>
      lines.push({ level, msg: entry.msg }));
    try {
      await expect(requireUserContext(failingClient)).rejects.toBeInstanceOf(AppErrorException);

      // Re-invoke to inspect the emitted envelope (rejects.toBeInstanceOf
      // swallowed the specific instance).
      let appError: { status: number; code: string; retryAfter?: number } | null = null;
      try {
        await requireUserContext(failingClient);
      } catch (e) {
        appError = (e as AppErrorException).appError;
      }
      expect(appError).not.toBeNull();
      expect(appError!.status).toBe(503);
      expect(appError!.code).toBe('SERVICE_UNAVAILABLE');
      expect(typeof appError!.retryAfter).toBe('number');

      // The shed hop must be observable: the cause is logged so 1003
      // rejections can be diagnosed instead of going dark — once per call.
      expect(lines).toEqual([
        { level: 'error', msg: 'auth verification hop failed' },
        { level: 'error', msg: 'auth verification hop failed' },
      ]);
    } finally {
      restoreSink();
    }
  });
});
