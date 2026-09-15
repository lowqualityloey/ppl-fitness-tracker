import { NextResponse } from 'next/server';
import { exportRateLimiter } from '../../../../../lib/auth/rate-limit';
import { requireUserContext } from '../../../../../lib/auth/require-user';
import { appErrorResponse, routeErrorResponse } from '../../../../../lib/http/route-error';
import { loggedRoute } from '../../../../../lib/http/request-log';
import { rateLimitedResponse } from '../../../../../lib/http/rate-limit-response';
import { getDb } from '../../../../../lib/db/client';
import { ExportRepository } from '../../../../../lib/repositories/export-repository';
import { buildExportV1 } from '../../../../../lib/export/v1';
import { appSuccess, notFoundError, validateOutgoing } from '../../../../../lib/contracts/envelope';
import { ExportV1Schema } from '../../../../../lib/contracts/export';

/**
 * M4-21 (#110): `GET /api/export/v1` — the "data is never hostage" endpoint.
 *
 * Thin adapter, contract-graph posture: identity is `requireUserContext()` and
 * nothing else (there is no path or query user id to spoof), the per-user
 * 5/hour budget arrives through the shared 429 helper, and the outgoing body
 * is validated against `ExportV1Schema` before it leaves — so a repository or
 * builder that drifts produces a redacted 500 rather than shipping an
 * envelope the archive contract forbids (an over-cap slice would 500 on
 * `sessions.max()`, never leak 201 sessions).
 *
 * The two response headers are both load-bearing: `no-store` because the body
 * *is* the user's archive, and `Content-Disposition: attachment` with a
 * date-stamped filename because the card's promise is a *downloadable* file,
 * not a JSON viewer tab. The 404 (a signed-in user with no profile row) gets
 * `no-store` too — its yes/no answer is itself per-user data, exactly as on
 * the profile route.
 *
 * This route has no write path: the export is pure read, and a mitigation that
 * could mutate or delete what it archives would not be a mitigation.
 */
export const GET = loggedRoute(handleGet);

async function handleGet(): Promise<NextResponse> {
  try {
    const context = await requireUserContext();

    const limited = rateLimitedResponse(exportRateLimiter, context.userId, 'export');
    if (limited) return limited;

    const repository = new ExportRepository(getDb(), context.claims);
    const rows = await repository.readArchive(context.userId);
    if (!rows) return appErrorResponse(notFoundError(), { 'Cache-Control': 'no-store' });

    const data = validateOutgoing(ExportV1Schema, buildExportV1(rows), 'export v1 archive');
    return NextResponse.json(appSuccess(data), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition':
          `attachment; filename="ppl-export-v1-${data.exportedAt.slice(0, 10).replaceAll('-', '')}.json"`,
      },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
