import { NextRequest, NextResponse } from 'next/server';
import { SyncRequestSchema } from '../../../../lib/contracts/sync';
import { appSuccess } from '../../../../lib/contracts/envelope';
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
    return NextResponse.json(appSuccess(data), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
