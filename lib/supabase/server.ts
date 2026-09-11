import { createServerClient } from '@supabase/ssr';
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

// `CookieJar` and `createClientFromCookieJar` live in `./cookie-jar` rather than
// here. They never touched `cookies()` — but sharing a module with `createClient()`
// meant that importing them pulled `next/headers` along with them, which made the
// test-only jar unusable from any loader that is not Next.js (Playwright's fails on
// the extensionless subpath export). The doc comment on the jar has claimed
// independence from `next/headers` since it was written; the file layout now agrees
// with it.
