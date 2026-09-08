import { NextRequest, NextResponse } from 'next/server';
import {
  SessionDetailParamsSchema,
  SessionDetailQuerySchema,
} from '../../../../../lib/contracts/sessions';
import { appSuccess, notFoundError } from '../../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../../lib/auth/require-user';
import { getDb } from '../../../../../lib/db/client';
import { appErrorResponse, routeErrorResponse } from '../../../../../lib/http/route-error';
import { WorkoutRepository } from '../../../../../lib/repositories/workout-repository';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const parsedParams = SessionDetailParamsSchema.safeParse(await params);
  const parsedQuery = SessionDetailQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsedParams.success) return routeErrorResponse(parsedParams.error);
  if (!parsedQuery.success) return routeErrorResponse(parsedQuery.error);

  try {
    const context = await requireUserContext();
    const repository = new WorkoutRepository(getDb(), context.claims);
    const data = await repository.findSession(context.userId, parsedParams.data.id);
    if (!data) return appErrorResponse(notFoundError());

    // M2-01 accepts since for contract compatibility. M2-04 owns true deltas.
    void parsedQuery.data.since;
    return NextResponse.json(appSuccess(data), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
