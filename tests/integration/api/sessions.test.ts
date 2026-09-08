import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import {
  SessionDetailResponseSchema,
  SessionStartResponseSchema,
  SessionsListResponseSchema,
} from '../../../lib/contracts/sessions.js';
import { authHeaders, ids, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('M1-16 RED: /api/sessions', () => {
  let owner!: TestSession;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('sessions');
  });

  afterAll(async () => {
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('returns a cursor-paginated session history using the canonical response contract', async () => {
    const response = await apiRequest('/api/sessions?cursor=opaque-cursor', { headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    expect(SessionsListResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it('starts a session with routineDayId and clientId and returns the session envelope', async () => {
    const response = await jsonRequest('/api/sessions', {
      routineDayId: ids.routineDay,
      clientId: ids.device,
    }, { method: 'POST', headers: authHeaders(owner) });
    expect([200, 201]).toContain(response.status);
    expect(SessionStartResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it('returns the existing session for an idempotent repeated clientId', async () => {
    const body = { routineDayId: ids.routineDay, clientId: '99999999-9999-4999-8999-999999999999' };
    const first = await jsonRequest('/api/sessions', body, { method: 'POST', headers: authHeaders(owner) });
    const second = await jsonRequest('/api/sessions', body, { method: 'POST', headers: authHeaders(owner) });
    expect([200, 201]).toContain(first.status);
    expect([200, 201]).toContain(second.status);
    const firstBody = await responseBody(first);
    const secondBody = await responseBody(second);
    expect(SessionStartResponseSchema.safeParse(firstBody).success).toBe(true);
    expect(SessionStartResponseSchema.safeParse(secondBody).success).toBe(true);
    expect(secondBody).toEqual(firstBody);
  });

  it('rejects unauthenticated session creation with the canonical 401 envelope', async () => {
    const response = await jsonRequest('/api/sessions', {
      routineDayId: ids.routineDay,
      clientId: ids.device,
    }, { method: 'POST' });
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });

  it('returns full session state and supports a since sequence delta query', async () => {
    const response = await apiRequest(`/api/sessions/${ids.session}?since=10`, { headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    expect(SessionDetailResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it('does not expose another user session through the canonical not-found envelope', async () => {
    const response = await apiRequest(`/api/sessions/${ids.session}`, { headers: authHeaders(owner) });
    await expectAppError(response, 404, 'NOT_FOUND');
  });
});
