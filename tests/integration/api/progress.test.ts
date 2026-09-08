import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { ExerciseProgressResponseSchema } from '../../../lib/contracts/progress.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('M1-16 RED: GET /api/progress/:exerciseSlug', () => {
  let owner!: TestSession;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('progress');
  });

  afterAll(async () => {
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('returns an e1RM trendline and PR history for a valid exercise slug', async () => {
    const response = await apiRequest('/api/progress/bench-press', { headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    expect(ExerciseProgressResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it('rejects traversal-shaped exercise slugs with the canonical validation envelope', async () => {
    const response = await apiRequest('/api/progress/%2e%2e%2fsecret', { headers: authHeaders(owner) });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('requires an authenticated user', async () => {
    const response = await apiRequest('/api/progress/bench-press');
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });
});
