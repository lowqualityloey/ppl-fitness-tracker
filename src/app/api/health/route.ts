import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import {
  appSuccess,
  serviceUnavailableError,
  validateOutgoing,
} from '../../../../lib/contracts/envelope';
import { HealthResponseSchema, type HealthResponseData } from '../../../../lib/contracts/health';
import { getDb } from '../../../../lib/db/client';
import { appErrorResponse } from '../../../../lib/http/route-error';
import { loggedRoute } from '../../../../lib/http/request-log';

/**
 * M4-30: `GET /api/health` — the release probe's target.
 *
 * Before this route, `pk:ship`'s post-deploy smoke test had nothing to hit: the
 * release readiness record's §4 probe table lists `/api/health` as "route does not
 * exist". A platform can report a successful deploy for an application that never
 * booted, so the probe has to be the application's own answer.
 *
 * **There is deliberately no auth check**, for the same reason `/api/exercises` has
 * none and a stronger one: a health probe that requires a session cannot report on a
 * broken auth path — it would fail for exactly the same reason production fails,
 * which is the moment the difference matters most. It exposes no user data; the only
 * fact it reports is whether this process can reach the database.
 *
 * **The database ping is the whole point.** A route that returns a hardcoded 200
 * reports that `next start` is running, which the platform already knows. `SELECT 1`
 * through the same `getDb()` pool every other route uses is what turns "the process
 * is up" into "the process can serve a request".
 *
 * **`no-store` is not decoration.** A cached health response describes the moment it
 * was cached — a green light with no witness behind it. It is set on both the 200
 * and the 503, because a cached *failure* is the mirror-image trap: a recovered
 * deployment would keep reporting itself dead.
 *
 * The 503 path does **not** report to the error sink. A database outage is an
 * expected condition this route exists to describe, not an application defect, and
 * routing it through `reportServerError` would flood the error channel exactly when
 * the signal is most needed. The released runbook treats a 503 as a rollback
 * criterion, not as a bug report.
 */
export const GET = loggedRoute(handleGet);

async function handleGet(): Promise<NextResponse> {
  const startedAt = performance.now();

  try {
    await getDb().execute(sql`SELECT 1`);

    const data: HealthResponseData = {
      status: 'ok',
      db: {
        ok: true,
        // Rounded for readability: this number travels into logs, a release record
        // and possibly a monitor, and sub-microsecond precision is noise there.
        latencyMs: Number((performance.now() - startedAt).toFixed(1)),
      },
    };

    // The producer is held to its own contract (#73's rule): a shape change has to
    // fail here rather than travel to a probe that then misreads a broken body as a
    // healthy one.
    return NextResponse.json(validateOutgoing(HealthResponseSchema, appSuccess(data)), {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return appErrorResponse(serviceUnavailableError(), { 'Cache-Control': 'no-store' });
  }
}
