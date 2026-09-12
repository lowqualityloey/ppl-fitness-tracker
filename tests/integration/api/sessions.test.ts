import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import {
  SessionDetailResponseSchema,
  SessionStartResponseSchema,
  SessionsListResponseSchema,
} from '../../../lib/contracts/sessions.js';
import {
  authHeaders,
  createTestSession,
  seedSessionFixtures,
  type FixtureIds,
  type SessionFixture,
  type TestSession,
} from './fixtures.js';
import { apiRequest, jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('M2-01: /api/sessions', () => {
  let owner!: TestSession;
  let fixtures!: SessionFixture;
  /** Minted per seeding call (#80); every reference below reads this run's rows. */
  let ids!: FixtureIds;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('sessions');
    fixtures = await seedSessionFixtures(owner);
    ids = fixtures.ids;
  });

  afterAll(async () => {
    const failures: unknown[] = [];
    const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        failures.push(error);
      }
    };

    if (fixtures) await attempt(() => fixtures.cleanup());
    if (owner) await attempt(() => owner.cleanup());
    await attempt(() => stopApiServer());

    if (failures.length > 0) {
      throw new AggregateError(failures, 'Could not fully clean up the sessions API test.');
    }
  });

  it('returns a cursor-paginated session history using the canonical response contract', async () => {
    const response = await apiRequest('/api/sessions', { headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    expect(SessionsListResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it('does not include another user session in the authenticated history', async () => {
    const response = await apiRequest('/api/sessions', { headers: authHeaders(owner) });
    const parsed = SessionsListResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.ok) {
      expect(parsed.data.data.sessions).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: ids.session })]),
      );
      expect(parsed.data.data.sessions.map((session) => session.id)).not.toContain(ids.foreignSession);
    }
  });

  it('rejects an invalid session cursor with the canonical validation envelope', async () => {
    const response = await apiRequest('/api/sessions?cursor=opaque-cursor', {
      headers: authHeaders(owner),
    });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('starts a new session with routineDayId and clientId', async () => {
    const response = await jsonRequest('/api/sessions', {
      routineDayId: ids.routineDay,
      clientId: ids.freshDevice,
    }, { method: 'POST', headers: authHeaders(owner) });
    expect([200, 201]).toContain(response.status);
    const parsed = SessionStartResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.ok) {
      expect(parsed.data.data).toMatchObject({
        clientId: ids.freshDevice,
        status: 'in_progress',
      });
    }
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

  it('rejects malformed JSON with the canonical validation envelope', async () => {
    const headers = new Headers(authHeaders(owner));
    headers.set('Content-Type', 'application/json');
    const response = await apiRequest('/api/sessions', {
      method: 'POST',
      headers,
      body: '{"routineDayId":',
    });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('rejects malformed session input with the canonical validation envelope', async () => {
    const response = await jsonRequest('/api/sessions', {
      routineDayId: 'not-a-uuid',
      clientId: ids.device,
    }, { method: 'POST', headers: authHeaders(owner) });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('rejects unauthenticated session reads and creation with canonical 401 envelopes', async () => {
    const list = await apiRequest('/api/sessions');
    await expectAppError(list, 401, 'UNAUTHENTICATED');

    const detail = await apiRequest(`/api/sessions/${ids.session}`);
    await expectAppError(detail, 401, 'UNAUTHENTICATED');

    const create = await jsonRequest('/api/sessions', {
      routineDayId: ids.routineDay,
      clientId: ids.device,
    }, { method: 'POST' });
    await expectAppError(create, 401, 'UNAUTHENTICATED');
  });

  it('returns the full session when since is ahead of the server seq (M3-01 rule)', async () => {
    // The fixture session sits at server_seq = 0, so ?since=10 is a client
    // claiming to be ahead. Under M2 this assertion passed because `since` was
    // discarded; under M3-01 it passes because a ahead-of-server client is
    // corrected with full state, never a "no change" answer.
    const response = await apiRequest(`/api/sessions/${ids.session}?since=10`, { headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    const body = await responseBody(response);
    const parsed = SessionDetailResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.ok) {
      expect(parsed.data.data).toMatchObject({
        id: ids.session,
        routineDay: {
          id: ids.routineDay,
          exercises: [{ id: ids.routineExercise, exercise: { id: ids.exercise } }],
        },
        sets: [{ id: ids.set, sessionId: ids.session, exerciseId: ids.exercise, weightKg: 60.5, reps: 8 }],
        tasks: [{ id: ids.task, sessionId: ids.session, taskKey: 'main_workout' }],
      });
      expect(parsed.data.data).not.toHaveProperty('userId');
    }
  });

  it('rejects malformed detail UUIDs and sequence queries', async () => {
    const malformedId = await apiRequest('/api/sessions/not-a-uuid', { headers: authHeaders(owner) });
    await expectAppError(malformedId, 400, 'VALIDATION_ERROR');

    const malformedSince = await apiRequest(`/api/sessions/${ids.session}?since=-1`, {
      headers: authHeaders(owner),
    });
    await expectAppError(malformedSince, 400, 'VALIDATION_ERROR');
  });

  it('rejects client-supplied identity fields at the request boundary', async () => {
    const response = await jsonRequest('/api/sessions', {
      routineDayId: ids.routineDay,
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: owner.userId,
    }, { method: 'POST', headers: authHeaders(owner) });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('does not expose another user session through the canonical not-found envelope', async () => {
    const response = await apiRequest(`/api/sessions/${ids.foreignSession}`, { headers: authHeaders(owner) });
    await expectAppError(response, 404, 'NOT_FOUND');
  });
});
