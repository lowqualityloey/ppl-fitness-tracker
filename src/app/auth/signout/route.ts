import { NextRequest, NextResponse } from 'next/server';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { appSuccess } from '../../../../lib/contracts/envelope';
import { SignoutRequestSchema } from '../../../../lib/contracts/auth';
import { routeErrorResponse } from '../../../../lib/http/route-error';
import { createClient } from '../../../../lib/supabase/server';

/**
 * M2-06 (#42): `POST /auth/signout`.
 *
 * Identity is resolved through `requireUserContext()` before anything is
 * cleared, for the same reason every other route uses it: an unauthenticated
 * caller must get the canonical 401 rather than a 200 that quietly did nothing.
 * The empty-object request schema is what makes the contract explicit — a body
 * with keys is a 400, not something to ignore.
 *
 * Scope is Supabase's default, **global**, deliberately: sign-in here is a magic
 * link with no password to rotate, so clearing cookies for one tab would leave
 * every other device holding a refreshable session while the UI says "signed
 * out". Local scope is the narrower choice and the less honest one for this
 * app. The consequence is deliberate and user-visible: signing out on one device
 * signs out all of them. `tests/integration/api/auth.test.ts` asserts exactly
 * that — the captured cookie must return 401 afterwards — so the scope cannot be
 * quietly softened back to `local` without a gate failing.
 *
 * The failure path is a bare throw mapped to the canonical 500 by
 * `routeErrorResponse`, because a sign-out that could not reach Auth cannot
 * promise anything to the caller — and reporting success would be the worst
 * available answer.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = SignoutRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const supabase = await createClient();
    await requireUserContext(supabase);

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error('supabase signOut failed');
    }

    return NextResponse.json(appSuccess({ signedOut: true }), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
