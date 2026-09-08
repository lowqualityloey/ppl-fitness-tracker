import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppEnvelopeSchema,
  AppErrorException,
  forbiddenError,
} from '../../../lib/contracts/envelope.js';
import {
  InvalidSessionCursorError,
  SessionStartConflictError,
} from '../../../lib/domain/sessions/types.js';
import { routeErrorResponse } from '../../../lib/http/route-error.js';

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

describe('route error translation', () => {
  it('maps AppErrorException to its canonical envelope', async () => {
    await expectTranslatedError(new AppErrorException(forbiddenError()), 403, 'FORBIDDEN');
  });

  it('maps Zod errors and invalid cursors to validation envelopes', async () => {
    await expectTranslatedError(new z.ZodError([]), 400, 'VALIDATION_ERROR');
    await expectTranslatedError(new InvalidSessionCursorError('invalid cursor'), 400, 'VALIDATION_ERROR');
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
