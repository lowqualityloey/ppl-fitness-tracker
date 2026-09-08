import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * M1-12: Refreshes the Supabase session on every matched request.
 *
 * Do not run any code between createServerClient() and
 * supabase.auth.getUser() below — that call is what actually triggers
 * the token refresh and cookie write. A stray early return here can
 * make sessions look like they're randomly expiring.
 *
 * getUser() (not getSession()) is used deliberately: getSession() reads
 * the JWT from the cookie without revalidating it against GoTrue.
 * getUser() makes the network round trip and is the only call in this
 * file that can be trusted for identity — this mirrors why
 * requireUser() (lib/auth/require-user.ts) also uses getUser() and never
 * decodes a cookie by hand (Amendment A1.2 — application code never
 * reads identity from anywhere except a verified Supabase Auth call).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    }
  );

  // IMPORTANT: do not remove. This is what refreshes the session.
  await supabase.auth.getUser();

  // No route redirection here — this middleware only keeps the session
  // cookie fresh. Per-route auth enforcement is requireUser()'s job
  // (lib/auth/require-user.ts), called explicitly by each handler, not
  // implied by a request reaching this file.

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every request path except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     * - common static asset extensions
     * The legacy vanilla-JS app runs on a separate Vite server (port
     * 3000) and never reaches this middleware (port 3001), so no
     * exclusion for it is needed here.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
