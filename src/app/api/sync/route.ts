import { NextRequest, NextResponse } from 'next/server';
import { SyncRequestSchema, SyncResponseSchema } from '../../../../lib/contracts/sync';
import { appSuccess, validateOutgoing } from '../../../../lib/contracts/envelope';
import { syncRateLimiter } from '../../../../lib/auth/rate-limit';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { rateLimitedResponse } from '../../../../lib/http/rate-limit-response';
import { routeErrorResponse } from '../../../../lib/http/route-error';
import { WorkoutRepository } from '../../../../lib/repositories/workout-repository';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = SyncRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();

    // Checked after identity and before any database work: the budget is per user,
    // so it cannot be evaluated before we know who the user is, and its whole
    // purpose is to keep an unbounded caller off the transaction pool.
    const limited = rateLimitedResponse(syncRateLimiter, context.userId, 'sync');
    if (limited) return limited;

    const repository = new WorkoutRepository(getDb(), context.claims);
    const data = await repository.applySync(context.userId, parsed.data);
    /*
     * The third consumer of the session graph, and the easy one to miss: `SyncResponseDataSchema.state`
     * *is* a `SessionStateSchema` (#73), so every sync response carries the whole session — the
     * runner's rejection-and-refetch path included, which is precisely mid-workout. Until this
     * slice that field was an empty pass-through placeholder, so a state the client could not use
     * was only noticed by the client.
     *
     * Validating here means the same drift that breaks `GET /api/sessions/[id]` breaks this route
     * too, and with the same redacted 500 rather than a body the client has to reject.
     */
    return NextResponse.json(
      validateOutgoing(SyncResponseSchema, appSuccess(data), 'POST /api/sync body'),
      { status: 200 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
