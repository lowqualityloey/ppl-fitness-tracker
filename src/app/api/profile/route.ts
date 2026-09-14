import { NextRequest, NextResponse } from 'next/server';
import { ProfilePatchSchema } from '../../../../lib/contracts/profile';
import { appSuccess, notFoundError } from '../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { appErrorResponse, routeErrorResponse } from '../../../../lib/http/route-error';
import { loggedRoute } from '../../../../lib/http/request-log';
import { ProfileRepository } from '../../../../lib/repositories/profile-repository';

/**
 * M3-00 (#57): `GET`/`PATCH /api/profile` — the server's memory of *who* the
 * user is and *how they want numbers shown*.
 *
 * Three properties this file is responsible for, each asserted from the
 * outside in `tests/integration/api/profile.test.ts`:
 *
 * 1. **Identity is `requireUserContext()` and nothing else.** The route takes
 *    no user id from the request; the repository receives `context.userId` as
 *    an argument. There is no way to ask about somebody else's profile,
 *    because there is no way to *say* "somebody else" here.
 * 2. **The patch surface is two fields.** `ProfilePatchSchema` is `.strict()`,
 *    so `{"email": ...}` is a 400, not an ignored field — and `email` is
 *    therefore un-patchable through any path a client can reach. This is the
 *    contract's claim (STATE §4 item 23); the schema names the offending key,
 *    the route refuses the request whole.
 * 3. **`no-store` on every response, success or 404.** These are per-user
 *    rows; a shared cache holding one athlete's display name and unit is a
 *    disclosure, full stop. The 404 branch gets the header too because it,
 *    like the 200, answers "does this user have a profile" — a question whose
 *    yes/no is itself per-user data.
 *
 * No conversion happens on this route or anywhere near it (ADR-0005): the
 * stored unit is a *display preference*, and the only weight values in this
 * process are the ones the response does not contain.
 */

function perUserHeaders(): HeadersInit {
  return { 'Cache-Control': 'no-store' };
}

export const GET = loggedRoute(handleGet);

async function handleGet(): Promise<NextResponse> {
  try {
    const context = await requireUserContext();
    const repository = new ProfileRepository(getDb(), context.claims);
    const data = await repository.getProfile(context.userId);
    if (!data) return appErrorResponse(notFoundError(), perUserHeaders());

    return NextResponse.json(appSuccess(data), { status: 200, headers: perUserHeaders() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export const PATCH = loggedRoute(handlePatch);

async function handlePatch(request: NextRequest): Promise<NextResponse> {
  const parsed = ProfilePatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new ProfileRepository(getDb(), context.claims);
    const data = await repository.patchProfile(context.userId, parsed.data);
    if (!data) return appErrorResponse(notFoundError(), perUserHeaders());

    return NextResponse.json(appSuccess(data), { status: 200, headers: perUserHeaders() });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
