import { describe, expect, it } from 'vitest';
import { ContractViolationError, appSuccess, internalError, validateOutgoing } from '../../../lib/contracts/envelope';
import { SessionDetailResponseSchema, SessionStateSchema } from '../../../lib/contracts/sessions';
import { routeErrorResponse } from '../../../lib/http/route-error';
import { mapperOutput } from './session-state-fixtures';

/**
 * #73's second half. A contract nobody's producer is held to is documentation, so the
 * routes parse what they are about to *send*. These are the tests for that seam: a route
 * handler cannot be imported into a node process (`next/headers` throws outside a
 * request), so the adapter is covered here and by `contract-graph.test.ts`, and end to end
 * by the API integration suites, which parse every real response through these schemas.
 */
describe('validateOutgoing — the producer-side contract check (#73)', () => {
  it('passes a real session through and normalizes its timestamps to the sent form', () => {
    const parsed = validateOutgoing(SessionStateSchema, mapperOutput(), 'test body');
    expect(parsed.startedAt).toBe('2026-09-11T09:00:00.000Z');
    expect(parsed.sets[0]?.clientTs).toBe('2026-09-11T09:00:00.000Z');
    // The value that goes out is the validated one, not the object that went in.
    expect(parsed.routineDay.exercises[0]?.exercise.name).toBe('Bench Press');
  });

  it('names the offending path when the mapper has drifted', () => {
    // A copy with the field removed, because `targetSets` is required: this is the drift
    // the check exists for, and the message has to say *where*.
    const state = mapperOutput();
    const placement: Record<string, unknown> = { ...state.routineDay.exercises[0]! };
    delete placement.targetSets;
    const drifted = {
      ...state,
      routineDay: { ...state.routineDay, exercises: [placement] },
    };
    let message = '';
    try {
      validateOutgoing(SessionDetailResponseSchema, appSuccess(drifted), 'GET /api/sessions/[id] body');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('GET /api/sessions/[id] body');
    expect(message).toContain('data.routineDay.exercises.0.targetSets');
  });

  it('is not a ZodError, because blaming the caller for a producer defect is wrong', () => {
    // `routeErrorResponse` maps `ZodError` → 400 `VALIDATION_ERROR`. A drifted mapper is
    // not a bad request, so the thrown type has to fall past that branch.
    const drifted = mapperOutput();
    delete (drifted.routineDay as unknown as Record<string, unknown>).slug;
    let thrown: unknown;
    try {
      validateOutgoing(SessionStateSchema, drifted, 'test body');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ContractViolationError);
    expect((thrown as Error).name).toBe('ContractViolationError');
    expect((thrown as Error).message).not.toBe(internalError().message);
  });

  it('reaches the client as the canonical redacted 500, with no schema detail leaked', async () => {
    const response = routeErrorResponse(new ContractViolationError('body', ['sets.0.weightKg: too big']));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ ok: false, error: internalError() });
    expect(JSON.stringify(body)).not.toContain('weightKg');
  });
});
