import { NextRequest, NextResponse } from 'next/server';
import { SessionPrefillQuerySchema } from '../../../../../lib/contracts/sessions';
import { appSuccess } from '../../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../../lib/auth/require-user';
import { getDb } from '../../../../../lib/db/client';
import { routeErrorResponse } from '../../../../../lib/http/route-error';
import { loggedRoute } from '../../../../../lib/http/request-log';
import { WorkoutRepository } from '../../../../../lib/repositories/workout-repository';

/**
 * M3-00 (#57): `GET /api/sessions/prefill`.
 *
 * The static `prefill` segment deliberately shares its parent with the dynamic
 * `[id]` route, and Next resolves static above dynamic — so `?routineDayId=…`
 * is parsed by `SessionPrefillQuerySchema`, not mistaken for a session UUID.
 * If that precedence ever changes, the request would fail as a malformed
 * `id` forever; `tests/integration/api/prefill.test.ts` proves the happy-path
 * 200 on every run, which is the assertion that actually catches shadowing.
 *
 * A 200 with `entries: []` is a *complete* answer ("nothing to remember yet"),
 * not an error — which is why there is no 404 branch here at all.
 */
export const GET = loggedRoute(handleGet);

async function handleGet(
  request: NextRequest,
): Promise<NextResponse> {
  const parsed = SessionPrefillQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new WorkoutRepository(getDb(), context.claims);
    const data = await repository.getPrefill(
      context.userId,
      parsed.data.routineDayId,
      parsed.data.excludeSessionId,
    );
    // Per-user history: one athlete's last known weights are never cacheable
    // content, and an empty answer still reveals who has trained what.
    return NextResponse.json(appSuccess(data), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
