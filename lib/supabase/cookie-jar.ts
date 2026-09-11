import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * In-memory cookie jar backing createClientFromCookieJar().
 * Exported so tests can seed it and read it back after a sign-in,
 * simulating "the browser sent this cookie on a later request" without
 * needing next/headers or an actual HTTP round trip.
 */
export class CookieJar {
  private store = new Map<string, string>();

  getAll(): { name: string; value: string }[] {
    return [...this.store.entries()].map(([name, value]) => ({ name, value }));
  }

  setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]): void {
    for (const { name, value } of cookiesToSet) {
      this.store.set(name, value);
    }
  }
}

/**
 * Test-only factory: builds the same createServerClient wiring as
 * createClient() in ./server, but backed by an explicit CookieJar instead of
 * next/headers. This exercises the real @supabase/ssr cookie
 * serialization path (session chunking, cookie naming, etc.) without
 * requiring an actual Next.js request context, which cookies() refuses
 * to run outside of.
 *
 * Not used by any production code path — requireUser() and route
 * handlers always go through createClient() in ./server.
 */
export function createClientFromCookieJar(jar: CookieJar) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(cookiesToSet) {
          jar.setAll(cookiesToSet);
        },
      },
    }
  );
}
