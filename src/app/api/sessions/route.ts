import { NextRequest, NextResponse } from 'next/server';
import {
  SessionStartRequestSchema,
  SessionsListQuerySchema,
} from '../../../../lib/contracts/sessions';
import { appSuccess } from '../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { routeErrorResponse } from '../../../../lib/http/route-error';
import { WorkoutRepository } from '../../../../lib/repositories/workout-repository';
import { currentUtcDate } from '../../../../lib/domain/local-date';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = SessionsListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new WorkoutRepository(getDb(), context.claims);
    const data = await repository.listSessions(context.userId, parsed.data.cursor);
    return NextResponse.json(appSuccess(data), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = SessionStartRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new WorkoutRepository(getDb(), context.claims);
    const data = await repository.startSession(
      context.userId,
      parsed.data.routineDayId,
      parsed.data.clientId,
      currentUtcDate(),
    );
    return NextResponse.json(appSuccess(data), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
