import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppEnvelopeSchema,
  AppErrorException,
  forbiddenError,
  notFoundError,
} from '../../../lib/contracts/envelope.js';
import {
  InvalidSessionCursorError,
  SessionConflictError,
  SessionStartConflictError,
  SessionValidationError,
  type SessionState,
} from '../../../lib/domain/sessions/types.js';
import { assertPhaseAdvance } from '../../../lib/domain/sessions/transition-table.js';
import { appErrorResponse, routeErrorResponse } from '../../../lib/http/route-error.js';
import { setLogSink, withRequestScope } from '../../../lib/logger/index.js';

async function expectTranslatedError(
  error: unknown,
  status: number,
  code: string,
): Promise<unknown> {
  const response = routeErrorResponse(error);
  expect(response.status).toBe(status);
  const body = await response.json();
  const parsed = AppEnvelopeSchema.safeParse(body);
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) {
    expect(parsed.data.error.code).toBe(code);
    expect(parsed.data.error.status).toBe(status);
  }
  return body;
}

function captureError(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected action to throw.');
}

describe('route error translation', () => {
  it('maps AppErrorException to its canonical envelope', async () => {
    await expectTranslatedError(new AppErrorException(forbiddenError()), 403, 'FORBIDDEN');
  });

  it('maps Zod errors and invalid cursors to validation envelopes', async () => {
    await expectTranslatedError(new z.ZodError([]), 400, 'VALIDATION_ERROR');
    await expectTranslatedError(new InvalidSessionCursorError('invalid cursor'), 400, 'VALIDATION_ERROR');
    await expectTranslatedError(new SessionValidationError('invalid lifecycle input'), 400, 'VALIDATION_ERROR');
  });

  it('maps concrete illegal edges to 400 and incomplete gates to 409', async () => {
    const state = {
      status: 'in_progress',
      phase: 'pre_workout',
      tasks: [],
    } as unknown as SessionState;

    await expectTranslatedError(
      captureError(() => assertPhaseAdvance(state, 'stretch')),
      400,
      'VALIDATION_ERROR',
    );
    await expectTranslatedError(
      captureError(() => assertPhaseAdvance(state, 'exercise')),
      409,
      'CONFLICT',
    );
  });

  it('maps generic lifecycle conflicts to the canonical conflict envelope', async () => {
    await expectTranslatedError(new SessionConflictError('phase gate'), 409, 'CONFLICT');
  });

  it('maps unresolved session start conflicts without exposing database details', async () => {
    const body = await expectTranslatedError(
      new SessionStartConflictError('constraint detail'),
      409,
      'CONFLICT',
    );

    expect(body).toEqual({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'The request conflicts with current state.',
        status: 409,
      },
    });
  });

  it('maps session not-found errors to the canonical not-found envelope', async () => {
    const error = new Error('hidden database detail');
    error.name = 'SessionNotFoundError';
    await expectTranslatedError(error, 404, 'NOT_FOUND');
  });

  it('redacts unexpected internal errors', async () => {
    const body = await expectTranslatedError(
      new Error('duplicate key value violates unique constraint workout_sessions_user_id_key'),
      500,
      'INTERNAL_ERROR',
    );

    expect(JSON.stringify(body)).not.toContain('workout_sessions_user_id_key');
  });
});

/*
 * M4-05 (#94): the two halves of "an error is findable after the fact" —
 * the cause kept on the server (the #125 complaint in one line) and the
 * opaque handle handed to the client — decided at the one choke point every
 * error response passes through. `route-error.test.ts` already proves the
 * *unscoped* payload is byte-for-byte what it was before the seam; this is
 * the scoped half, asserted through the injected sink rather than stdout.
 */
describe('error-to-trail correlation', () => {
  it('stamps the scoped request id onto the client envelope and keeps the cause server-side', async () => {
    const lines: Array<{ level: string; msg: string; request_id: string | null }> = [];
    const restore = setLogSink((_line, entry, level) =>
      lines.push({ level, msg: entry.msg, request_id: entry.request_id }));
    try {
      await withRequestScope(async () => {
        const body = await expectTranslatedError(new Error('duplicate key'), 500, 'INTERNAL_ERROR');
        const parsed = AppEnvelopeSchema.parse(body);
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.error.requestId).toBe('req-choke-point');
      }, { requestId: 'req-choke-point' });
    } finally {
      restore();
    }

    expect(lines).toEqual([
      { level: 'error', msg: 'route error: unhandled cause', request_id: 'req-choke-point' },
    ]);
    // Nothing internal crossed the wire: the cause died on the server, the
    // id is the only new fact the client got — and the id is not a secret.
    expect(JSON.stringify(lines)).not.toContain('duplicate key');
  });

  it('stamps every error class, not just the fall-through', async () => {
    const restore = setLogSink(() => undefined);
    try {
      await withRequestScope(async () => {
        const response = appErrorResponse(notFoundError());
        const parsed = AppEnvelopeSchema.parse(await response.json());
        expect(parsed.ok).toBe(false);
        if (parsed.ok) return;
        expect(parsed.error.requestId).toBe('req-404');
      }, { requestId: 'req-404' });
    } finally {
      restore();
    }
  });
});
