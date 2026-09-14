import { NextRequest, NextResponse } from 'next/server';
import { ExerciseProgressParamsSchema } from '../../../../../lib/contracts/progress';
import { appSuccess, notFoundError } from '../../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../../lib/auth/require-user';
import { getDb } from '../../../../../lib/db/client';
import { appErrorResponse, routeErrorResponse } from '../../../../../lib/http/route-error';
import { loggedRoute } from '../../../../../lib/http/request-log';
import { ProgressRepository } from '../../../../../lib/repositories/progress-repository';

/**
 * M2-06 (#42): `GET /api/progress/:exerciseSlug`.
 *
 * The slug is parsed by `ExerciseProgressParamsSchema` before it reaches the
 * database, and that schema's `^[a-z0-9]+(?:-[a-z0-9]+)*$` anchor is what turns
 * traversal-shaped input into a 400. It matters that the rejection is a pattern
 * check rather than a lookup miss: an unvalidated `../` would otherwise be
 * *answered* with a 404, which leaks nothing but quietly invites the next person
 * to build a query around raw path segments.
 *
 * Unknown-but-well-formed slugs are a 404, and so is a slug that exists but
 * belongs to another user — the two are indistinguishable on purpose, for the
 * same reason sign-in never says "no such account": confirming existence is
 * itself a disclosure.
 *
 * Identity is `requireUserContext()` only, and `userId` is passed to the
 * repository as an argument rather than read from the URL, so a request cannot
 * ask for someone else's trendline by naming them.
 */
type RouteContext = { params: Promise<{ exerciseSlug: string }> };

export const GET = loggedRoute(handleGet);

async function handleGet(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const parsedParams = ExerciseProgressParamsSchema.safeParse(await params);
  if (!parsedParams.success) return routeErrorResponse(parsedParams.error);

  try {
    const context = await requireUserContext();
    const repository = new ProgressRepository(getDb(), context.claims);
    const data = await repository.getExerciseProgress(context.userId, parsedParams.data.exerciseSlug);
    if (!data) return appErrorResponse(notFoundError());

    return NextResponse.json(appSuccess(data), {
      status: 200,
      // Per-user and never shared: `s-maxage` here would let one athlete's
      // strength curve be served to someone else from a CDN edge.
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
