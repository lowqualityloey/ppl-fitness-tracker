import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { SignoutResponseSchema } from '../../../lib/contracts/auth.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
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

  // Live since #42 landed the handler. Ordering is load-bearing: the specs that
  // send no cookies, or the wrong body, cannot be disturbed by the revocation the
  // last one performs, so the session-destroying spec runs last and owns teardown.
  it('rejects unauthenticated signout with the canonical 401 envelope', async () => {
    const response = await jsonRequest('/auth/signout', {}, { method: 'POST' });
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });

  it('rejects a signout body carrying keys instead of ignoring it', async () => {
    const response = await jsonRequest('/auth/signout', { scope: 'global' }, {
      method: 'POST', headers: authHeaders(owner),
    });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('clears an authenticated SSR session through POST /auth/signout, and means it', async () => {
    const before = await apiRequest('/api/sessions', { headers: authHeaders(owner) });
    expect(before.status).toBe(200);
    await before.body?.cancel();

    const response = await jsonRequest('/auth/signout', {}, {
      method: 'POST', headers: authHeaders(owner),
    });
    expect(response.status).toBe(200);
    expect(SignoutResponseSchema.safeParse(await responseBody(response)).success).toBe(true);

    // A 200 with the cookies merely re-set is not a sign-out. Assert the auth
    // cookies are expired in the response itself.
    const authCookies = response.headers.getSetCookie().filter((entry) => /sb-[^;]*auth-token/.test(entry));
    expect(authCookies.length).toBeGreaterThan(0);
    expect(authCookies.every((entry) => /max-age=0|expires=Thu, 01 Jan 1970/i.test(entry))).toBe(true);

    // Global scope is what makes the captured cookie worthless afterwards, which is
    // the claim the route's doc comment stakes out. If Auth still accepted it, the
    // "signed out everywhere" wording would be a lie and this spec is where we learn.
    const after = await apiRequest('/api/sessions', { headers: authHeaders(owner) });
    await expectAppError(after, 401, 'UNAUTHENTICATED');
  });
});
