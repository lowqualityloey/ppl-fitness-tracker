import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { SyncResponseSchema } from '../../../lib/contracts/sync.js';
import { authHeaders, clientTs, createTestSession, ids, type TestSession } from './fixtures.js';
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
  taskKey: 'warm_up' as const,
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

describe('M1-16 RED: POST /api/sync', () => {
  let owner!: TestSession;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('sync');
  });

  afterAll(async () => {
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('accepts all four mutation operations and returns the sync response envelope', async () => {
    const response = await jsonRequest('/api/sync', syncBody([setMutation, taskMutation, phaseMutation, finishMutation]), {
      method: 'POST', headers: authHeaders(owner),
    });
    expect(response.status).toBe(200);
    expect(SyncResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
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

  it('enforces the documented 120 requests per minute per-user limit', async () => {
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
