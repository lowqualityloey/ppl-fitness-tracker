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
     * Validation here is not a leftover from the session-graph era — it is the opposite. #73 made
     * this route parse the graph it shipped; #105 deleted that field, because no client read it and
     * the drain behind every queued mutation paid for it. What remains is the reason the call
     * exists: `.strict()` means a body that grows a key the contract stopped describing — including
     * `state`, if someone puts it back — fails here with a redacted 500 rather than shipping bytes
     * nobody owns. Authoritative session state is `GET /api/sessions/[id]`'s to carry, and the
     * runner's rejection-and-refetch path (#63) is the consumer that reads it.
     */
    return NextResponse.json(
      validateOutgoing(SyncResponseSchema, appSuccess(data), 'POST /api/sync body'),
      { status: 200 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
