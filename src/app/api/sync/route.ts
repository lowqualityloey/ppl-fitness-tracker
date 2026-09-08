import { NextRequest, NextResponse } from 'next/server';
import { SyncRequestSchema } from '../../../../lib/contracts/sync';
import { appSuccess } from '../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { routeErrorResponse } from '../../../../lib/http/route-error';
import { WorkoutRepository } from '../../../../lib/repositories/workout-repository';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = SyncRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new WorkoutRepository(getDb(), context.claims);
    const data = await repository.applySync(context.userId, parsed.data);
    return NextResponse.json(appSuccess(data), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
