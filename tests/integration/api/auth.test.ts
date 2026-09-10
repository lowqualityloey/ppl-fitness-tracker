import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { SignoutResponseSchema } from '../../../lib/contracts/auth.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { isPending } from './pending-handlers.js';
import { apiRequest, jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('M1-16 RED: auth route coverage', () => {
  let owner!: TestSession;

  beforeAll(async () => {
    await startApiServer();
    owner = await createTestSession('auth');
  });

  afterAll(async () => {
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('keeps M1-13 malformed magic-link callback coverage on the 400 envelope', async () => {
    const response = await apiRequest('/auth/confirm?token_hash=&type=email');
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  // POST /auth/signout does not exist yet (#42), so these two are declared pending
  // rather than left to fail the gate. The M1-13 callback spec above stays live:
  // /auth/confirm is shipped, and regressing its 400 envelope must break CI.
  it.skipIf(isPending('signout'))('clears an authenticated SSR session through POST /auth/signout', async () => {
    const response = await jsonRequest('/auth/signout', {}, {
      method: 'POST', headers: authHeaders(owner),
    });
    expect(response.status).toBe(200);
    expect(SignoutResponseSchema.safeParse(await responseBody(response)).success).toBe(true);
  });

  it.skipIf(isPending('signout'))('rejects unauthenticated signout with the canonical 401 envelope', async () => {
    const response = await jsonRequest('/auth/signout', {}, { method: 'POST' });
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });
});
