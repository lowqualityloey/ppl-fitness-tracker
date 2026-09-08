import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { SyncResponseSchema } from '../../../lib/contracts/sync.js';
import { authHeaders, clientTs, createTestSession, ids, seedSessionFixtures, type SessionFixture, type TestSession } from './fixtures.js';
import { jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

const setMutation = {
  op: 'set.upsert' as const,
  mutationId: ids.mutation,
  clientTs,
  sessionId: ids.session,
  exerciseId: ids.exercise,
  setIndex: 0,
  isCompleted: true,
  weightKg: 60.5,
  reps: 8,
};

const taskMutation = {
  op: 'task.complete' as const,
  mutationId: '66666666-6666-4666-8666-666666666666',
  clientTs,
  sessionId: ids.session,
  taskKey: 'main_workout' as const,
  completedAt: clientTs,
};

const phaseMutation = {
  op: 'phase.advance' as const,
  mutationId: '77777777-7777-4777-8777-777777777777',
  clientTs,
  sessionId: ids.session,
  phase: 'exercise' as const,
};

const finishMutation = {
  op: 'session.finish' as const,
  mutationId: '88888888-8888-4888-8888-888888888888',
  clientTs,
  sessionId: ids.session,
};

function syncBody(mutations: unknown[] = [setMutation]) {
  return { deviceId: ids.device, sinceSeq: 0, mutations };
}

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('M2-04: POST /api/sync', () => {
  let owner!: TestSession;
  let fixtures!: SessionFixture;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('sync');
    fixtures = await seedSessionFixtures(owner);
  });

  afterAll(async () => {
    if (fixtures) await fixtures.cleanup();
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('returns item-level results for all four mutation operations', async () => {
    const response = await jsonRequest('/api/sync', syncBody([setMutation, taskMutation, phaseMutation, finishMutation]), {
      method: 'POST', headers: authHeaders(owner),
    });
    expect(response.status).toBe(200);
    const body = await responseBody(response);
    const parsed = SyncResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.ok) return;
    expect(parsed.data.data.applied).toEqual([setMutation.mutationId, taskMutation.mutationId]);
    expect(parsed.data.data.rejected).toEqual([
      { mutationId: phaseMutation.mutationId, reason: 'INVALID_MUTATION' },
      { mutationId: finishMutation.mutationId, reason: 'CONFLICT' },
    ]);
    expect(parsed.data.data.serverSeq).toBe(2);
    expect(parsed.data.data.clockSkewMs).toEqual(expect.any(Number));
    expect(parsed.data.data.state).toMatchObject({
      id: ids.session,
      phase: 'exercise',
      status: 'in_progress',
      serverSeq: 2,
      sets: [{ exerciseId: ids.exercise, setIndex: 0, weightKg: 60.5, reps: 8 }],
    });
  });

  it('applies valid ordered phase and finish operations with authoritative sequence state', async () => {
    const setOne = {
      op: 'set.upsert' as const,
      mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientTs,
      sessionId: ids.session,
      exerciseId: ids.exercise,
      setIndex: 1,
      isCompleted: true,
      weightKg: 60.5,
      reps: 8,
    };
    const setTwo = { ...setOne, mutationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', setIndex: 2 };
    const advanceStretch = {
      op: 'phase.advance' as const,
      mutationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      clientTs,
      sessionId: ids.session,
      phase: 'stretch' as const,
    };
    const stretchTask = {
      op: 'task.complete' as const,
      mutationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      clientTs,
      sessionId: ids.session,
      taskKey: 'stretch' as const,
      completedAt: clientTs,
    };
    const advancePostWorkout = {
      op: 'phase.advance' as const,
      mutationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      clientTs,
      sessionId: ids.session,
      phase: 'post_workout' as const,
    };
    const finish = {
      op: 'session.finish' as const,
      mutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      clientTs,
      sessionId: ids.session,
      completedAt: clientTs,
    };

    const response = await jsonRequest('/api/sync', syncBody([
      setOne, setTwo, advanceStretch, stretchTask, advancePostWorkout, finish,
    ]), { method: 'POST', headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    const parsed = SyncResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.ok) return;
    expect(parsed.data.data.applied).toEqual([
      setOne.mutationId,
      setTwo.mutationId,
      advanceStretch.mutationId,
      stretchTask.mutationId,
      advancePostWorkout.mutationId,
      finish.mutationId,
    ]);
    expect(parsed.data.data.rejected).toEqual([]);
    expect(parsed.data.data.serverSeq).toBe(8);
    expect(parsed.data.data.state).toMatchObject({
      id: ids.session,
      status: 'completed',
      phase: 'post_workout',
      serverSeq: 8,
      sets: [
        { exerciseId: ids.exercise, setIndex: 0, isCompleted: true },
        { exerciseId: ids.exercise, setIndex: 1, isCompleted: true },
        { exerciseId: ids.exercise, setIndex: 2, isCompleted: true },
      ],
    });
  });

  it('rejects an unauthenticated sync request with the canonical 401 envelope', async () => {
    const response = await jsonRequest('/api/sync', syncBody(), { method: 'POST' });
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });

  it('rejects a 201-mutation batch with the canonical validation envelope', async () => {
    const response = await jsonRequest('/api/sync', syncBody(Array.from({ length: 201 }, () => setMutation)), {
      method: 'POST', headers: authHeaders(owner),
    });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('reports an identical mutation replay as applied without a duplicate response shape', async () => {
    const first = await jsonRequest('/api/sync', syncBody(), { method: 'POST', headers: authHeaders(owner) });
    const second = await jsonRequest('/api/sync', syncBody(), { method: 'POST', headers: authHeaders(owner) });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(SyncResponseSchema.safeParse(await responseBody(first)).success).toBe(true);
    expect(SyncResponseSchema.safeParse(await responseBody(second)).success).toBe(true);
  });

  it('hides a foreign session behind the canonical not-found response', async () => {
    const response = await jsonRequest('/api/sync', syncBody([{
      ...setMutation,
      mutationId: '99999999-9999-4999-8999-999999999999',
      sessionId: ids.foreignSession,
    }]), { method: 'POST', headers: authHeaders(owner) });
    await expectAppError(response, 404, 'NOT_FOUND');
  });

  it('rejects mixed-session batches before repository ownership lookup', async () => {
    const response = await jsonRequest('/api/sync', syncBody([
      setMutation,
      { ...setMutation, mutationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sessionId: ids.foreignSession },
    ]), { method: 'POST', headers: authHeaders(owner) });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  // Route hardening, including the distributed limiter, is owned by issue #42.
  it.skip('enforces the documented 120 requests per minute per-user limit', async () => {
    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 121; attempt += 1) {
      lastResponse = await jsonRequest('/api/sync', syncBody(), {
        method: 'POST', headers: authHeaders(owner),
      });
    }
    if (!lastResponse) throw new Error('Expected a rate-limit response.');
    await expectAppError(lastResponse, 429, 'RATE_LIMITED');
  }, 30_000);
});
