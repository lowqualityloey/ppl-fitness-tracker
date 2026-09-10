import { NextResponse } from 'next/server';
import { appSuccess } from '../../../../lib/contracts/envelope';
import { ExercisesListQuerySchema } from '../../../../lib/contracts/exercises';
import { ContentRepository } from '../../../../lib/repositories/content-repository';
import { routeErrorResponse } from '../../../../lib/http/route-error';

/**
 * M2-06 (#42): `GET /api/exercises` — the shared library, publicly readable.
 *
 * Two decisions here are load-bearing.
 *
 * The query string is validated against a strict empty object, so `?userId=…` or
 * any unexpected parameter is a 400 rather than something silently ignored. A
 * resource that tolerates unknown parameters "harmlessly" today is the same
 * resource that trusts one tomorrow.
 *
 * There is deliberately **no** auth check. The library is system content, the
 * M1-16 contract expects a 200 without credentials, and the response is edge-
 * cacheable for an hour — a per-user check here would either make the cache
 * meaningless or imply the payload is user-specific, which it is not. Isolation
 * lives in `ContentRepository` instead: an explicit `owner_user_id IS NULL`
 * predicate over public columns only, with RLS as an independent backstop rather
 * than the mechanism.
 *
 * `s-maxage` (shared cache) and not `max-age` (private): the payload is identical
 * for everyone, so it belongs in one upstream copy, and staleness costs nothing
 * but a re-read of rows that only change when seeds are re-run.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const parsed = ExercisesListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const exercises = await new ContentRepository().listSystemExercises();
    return NextResponse.json(appSuccess({ exercises }), {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
