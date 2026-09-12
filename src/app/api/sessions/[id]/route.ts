import { NextRequest, NextResponse } from 'next/server';
import {
  SessionDetailParamsSchema,
  SessionDetailQuerySchema,
  SessionDetailResponseSchema,
  type SessionNotModified,
} from '../../../../../lib/contracts/sessions';
import { appSuccess, notFoundError, validateOutgoing } from '../../../../../lib/contracts/envelope';
import { requireUserContext } from '../../../../../lib/auth/require-user';
import { getDb } from '../../../../../lib/db/client';
import { appErrorResponse, routeErrorResponse } from '../../../../../lib/http/route-error';
import { WorkoutRepository } from '../../../../../lib/repositories/workout-repository';

type RouteContext = { params: Promise<{ id: string }> };

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * M2-01 (#21) shipped the read; M3-01 (#58) made `since` real. Between them
 * this file *discarded* the parsed value behind a comment claiming deltas
 * belonged to M2-04 — a claim no code ever honored (contract-graph.test.ts
 * now forbids that discard and that comment from coming back). The semantics
 * live in `SessionDetailQuerySchema` (lib/contracts/sessions.ts), where a
 * client generating from the contract cannot miss them:
 *
 * - `since === server_seq` → `{ notModified: true, serverSeq }`, **no session
 *   body** — the poll the M3-05 <5 s SLA depends on.
 * - `since < server_seq` or `since > server_seq` → the full session. A client
 *   claiming to be ahead of the server gets corrected by data, not by an
 *   error it might retry into oblivion.
 *
 * The seq is read **before** the session graph: a short-circuited poll costs
 * one indexed single-column lookup, so the cost has to actually stop there.
 * The token is `workout_sessions.server_seq` — never `updated_at`, never a
 * client clock.
 */
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
    const sessionId = parsedParams.data.id;
    const { since } = parsedQuery.data;

    if (since !== undefined) {
      const serverSeq = await repository.getSessionServerSeq(context.userId, sessionId);
      if (serverSeq === null) return appErrorResponse(notFoundError(), NO_STORE);

      if (since === serverSeq) {
        const data: SessionNotModified = { notModified: true, serverSeq };
        return NextResponse.json(appSuccess(data), { status: 200, headers: NO_STORE });
      }
    }

    const data = await repository.findSession(context.userId, sessionId);
    if (!data) return appErrorResponse(notFoundError(), NO_STORE);
    /*
     * The full-session branch is the one that carries the session graph, so it is parsed
     * through the contract that describes it before it is sent (#73). The `notModified`
     * short-circuit above is deliberately untouched: it has no session body, and wrapping it
     * would validate a shape this route is specified to omit.
     *
     * Inside the `try` on purpose. `validateOutgoing` throws `ContractViolationError`, which
     * is not a `ZodError`, so `routeErrorResponse` renders it as the canonical redacted 500
     * instead of blaming the caller for a producer-side defect. The alternative is shipping a
     * body the client rejects, which surfaces as a broken workout screen a long way from the
     * change that caused it.
     */
    return NextResponse.json(
      validateOutgoing(SessionDetailResponseSchema, appSuccess(data), 'GET /api/sessions/[id] body'),
      { status: 200, headers: NO_STORE },
    );
  } catch (error) {
    return routeErrorResponse(error);
  }
}
