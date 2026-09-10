import { NextRequest, NextResponse } from 'next/server';
import { legacyImportRateLimiter } from '../../../../../lib/auth/rate-limit';
import { requireUserContext } from '../../../../../lib/auth/require-user';
import { appSuccess } from '../../../../../lib/contracts/envelope';
import { LegacyImportRequestSchema } from '../../../../../lib/contracts/import';
import { LegacyImporter } from '../../../../../lib/domain/import/legacy-import-service';
import { getDb } from '../../../../../lib/db/client';
import { rateLimitedResponse } from '../../../../../lib/http/rate-limit-response';
import { routeErrorResponse } from '../../../../../lib/http/route-error';
import { LegacyImportRepository } from '../../../../../lib/repositories/legacy-import-repository';

/**
 * M2-05 (#40): one-time legacy localStorage import.
 *
 * A thin adapter, like every other route here: boundary parse, verified
 * identity, delegate, canonical envelope. Two rules are visible from here on
 * purpose.
 *
 * Identity comes only from `requireUserContext()`. The request body is a bag of
 * progress values and has no user field, so there is nothing to spoof; the
 * importer receives `context.userId` as an argument and the repository asserts
 * it against the RLS claims before any query.
 *
 * The rate limit is keyed by user id, not client IP, because the documented
 * budget is five requests *per user* per hour. Keying by IP would let one
 * NAT'd household spend everyone's allowance, and `clientIp` exists here only
 * because sign-in can be attempted before an identity exists.
 *
 * 2xx means "this report describes what now exists". The client is responsible
 * for archiving its own localStorage keys afterwards (spec §4.5 step 5); this
 * handler has no destructive path at all.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = LegacyImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();

    // M2-06 (#42): the 429 shape now comes from the shared helper, so this route
    // cannot drift from the sync route's envelope, status, or Retry-After header.
    const limited = rateLimitedResponse(legacyImportRateLimiter, context.userId, 'import');
    if (limited) return limited;

    const repository = new LegacyImportRepository(getDb(), context.claims);
    const importer = new LegacyImporter(repository);
    const result = await importer.import(context.userId, parsed.data);

    return NextResponse.json(appSuccess({ report: result.report }), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
