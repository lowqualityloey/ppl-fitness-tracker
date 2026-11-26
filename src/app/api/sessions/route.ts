import { NextRequest, NextResponse } from 'next/server';
import {
  SessionStartRequestSchema,
  SessionStartResponseSchema,
  SessionsListQuerySchema,
} from '../../../../lib/contracts/sessions';
import { appSuccess, validateOutgoing } from '../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../lib/auth/require-user';
import { getDb } from '../../../../lib/db/client';
import { routeErrorResponse } from '../../../../lib/http/route-error';
import { loggedRoute } from '../../../../lib/http/request-log';
import { WorkoutRepository } from '../../../../lib/repositories/workout-repository';
import { currentUtcDate } from '../../../../lib/domain/local-date';

export const GET = loggedRoute(handleGet);

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const parsed = SessionsListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) return routeErrorResponse(parsed.error);

  try {
    const context = await requireUserContext();
    const repository = new WorkoutRepository(getDb(), context.claims);
    const data = await repository.listSessions(context.userId, {
      cursor: parsed.data.cursor,
      from: parsed.data.from,
      to: parsed.data.to,
    });
    return NextResponse.json(appSuccess(data), { status: 200 });
  } catch (error) {
    return routeErrorResponse(error);
  }
}

/**
 * Starting a session returns the **whole session graph** — which is why this branch, and
 * not the list above, is the one that asserts it. `GET /api/sessions` has been described by
 * `SessionSummarySchema` all along; #73 is about the empty pass-through placeholder that
 * `SessionStateSchema` used to be, so the check goes where that placeholder was consumed.
 */
export const POST = loggedRoute(handlePost);

async function handlePost(request: NextRequest): Promise<NextResponse> {
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
    /*
     * The body is a full session graph, so it is parsed through the contract that
     * describes it before it goes out (#73). Inside the `try` on purpose: a mapper that
     * drifts throws `ContractViolationError`, which `routeErrorResponse` renders as the
     * canonical redacted 500. That is the alternative to shipping a payload the client
     * then refuses — which surfaces as a broken workout screen, far from the change
     * that caused it. `validateOutgoing` also normalizes `Date` → ISO string, so what is
     * validated is byte-for-byte what is sent.
     */
    return NextResponse.json(
      validateOutgoing(SessionStartResponseSchema, appSuccess(data), 'POST /api/sessions body'),
      { status: 200 },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
