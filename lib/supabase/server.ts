import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * M1-12: Supabase server client factory for Server Components, Server
 * Actions, and Route Handlers.
 *
 * Per the current @supabase/ssr contract, cookie access is ONLY via
 * getAll()/setAll() — never per-cookie get()/set()/remove(). That
 * deprecated shape silently breaks session refresh.
 *
 * Server Components cannot write cookies (Next.js throws), so setAll()
 * here is wrapped in try/catch. That's safe *only* because middleware.ts
 * refreshes the session on every request — if the middleware is ever
 * removed, silently-dropped cookie writes here would start causing
 * random sign-outs. Do not add a "the try/catch never fires" comment
 * without also removing the middleware in the same change.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookies() there is
            // read-only. Ignored because middleware.ts is responsible
            // for refreshing and persisting the session on every request.
          }
        },
      },
    }
  );
}

/**
 * In-memory cookie jar backing createClientFromCookieJar() below.
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
 * createClient() above, but backed by an explicit CookieJar instead of
 * next/headers. This exercises the real @supabase/ssr cookie
 * serialization path (session chunking, cookie naming, etc.) without
 * requiring an actual Next.js request context, which cookies() refuses
 * to run outside of.
 *
 * Not used by any production code path — requireUser() and route
 * handlers always go through createClient() above.
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
