import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { ProfileResponseSchema } from '../../../lib/contracts/profile.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

/**
 * M3-00 (#57): `GET`/`PATCH /api/profile`.
 *
 * What this file refuses to take on faith:
 *
 * - The strict-schema promise. `{"email":"x@y.z"}` must come back as a 400 that
 *   *names email*, and the subsequent GET must still show the original address —
 *   otherwise "unknown keys are 400s" is a comment, not a control (STATE §4 item 23).
 * - ADR-0005 from the read side: PATCHing the display unit never touches any
 *   stored weight, because this endpoint has no conversion path to begin with.
 * - RLS two-layer scoping: user B's GET after user A's PATCH must show B's
 *   untouched row, not A's values.
 * - `no-store` on per-user responses, matching every other authenticated read here.
 *
 * The profile row itself comes from the `handle_new_user` trigger, so these
 * specs also prove the trigger fired: a fresh user GETs `kg` / `null` defaults
 * without the app ever writing them.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('/api/profile', () => {
  let owner!: TestSession;
  let other!: TestSession;
  let client!: Client;

  const get = (session?: TestSession) =>
    apiRequest('/api/profile', session ? { headers: authHeaders(session) } : {});
  const patch = (body: unknown, session: TestSession = owner!) =>
    jsonRequest('/api/profile', body, { method: 'PATCH', headers: authHeaders(session) });

  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the profile API suite.');
    await startApiServer();
    client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    owner = await createTestSession('profile');
    other = await createTestSession('profile-other');
  });

  afterAll(async () => {
    if (client) {
      // profiles.id has no FK to auth.users, so deleting the auth user does not
      // remove the row; cleanup is explicit or these ids leak into later runs.
      await client.query('DELETE FROM profiles WHERE id = ANY($1)', [[owner?.userId, other?.userId]]);
      await client.end();
    }
    if (owner) await owner.cleanup();
    if (other) await other.cleanup();
    await stopApiServer();
  });

  it('rejects unauthenticated GET and PATCH with the canonical 401', async () => {
    await expectAppError(await get(), 401, 'UNAUTHENTICATED');
    await expectAppError(await jsonRequest('/api/profile', { preferredUnit: 'lbs' }, { method: 'PATCH' }), 401, 'UNAUTHENTICATED');
  });

  it('serves the trigger-created row with server defaults, no-store', async () => {
    const response = await get(owner);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const parsed = ProfileResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.ok) {
      expect(parsed.data.data.userId).toBe(owner.userId);
      expect(parsed.data.data.preferredUnit).toBe('kg');
      expect(parsed.data.data.displayName).toBeNull();
      expect(parsed.data.data.email).toMatch(/^m1-16-profile/);
    }
  });

  it('persists preferredUnit and a trimmed displayName across a re-read', async () => {
    const first = await patch({ preferredUnit: 'lbs' });
    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    const firstBody = ProfileResponseSchema.parse(await responseBody(first));
    if (firstBody.ok) expect(firstBody.data.preferredUnit).toBe('lbs');

    const second = await patch({ displayName: '  Iron  ' });
    if (second.status === 200) {
      const body = ProfileResponseSchema.parse(await responseBody(second));
      if (body.ok) expect(body.data.displayName).toBe('Iron');
    }
    expect(second.status).toBe(200);

    const reread = ProfileResponseSchema.parse(await responseBody(await get(owner)));
    if (reread.ok) {
      expect(reread.data.preferredUnit).toBe('lbs');
      expect(reread.data.displayName).toBe('Iron');
      // Email is read-only through this endpoint; identity still owns it.
      expect(reread.data.email).toMatch(/^m1-16-profile/);
    }
  });

  it('answers PATCH {displayName, preferredUnit} in one request', async () => {
    const response = await patch({ displayName: 'Combo', preferredUnit: 'kg' });
    expect(response.status).toBe(200);
    const body = ProfileResponseSchema.parse(await responseBody(response));
    if (body.ok) {
      expect(body.data.displayName).toBe('Combo');
      expect(body.data.preferredUnit).toBe('kg');
    }
  });

  it('rejects an email patch as 400 and changes nothing (never a silent ignore)', async () => {
    // The unit spec proves the schema rejects {email} and names the key; this
    // proves the endpoint refuses the whole request (a 200 would be the silent
    // ignore) and that the stored identity is untouched.
    const response = await patch({ email: 'attacker@evil.example' });
    await expectAppError(response, 400, 'VALIDATION_ERROR');

    const reread = ProfileResponseSchema.parse(await responseBody(await get(owner)));
    if (reread.ok) expect(reread.data.email).not.toBe('attacker@evil.example');
  });

  it('rejects empty and over-long patches, and malformed bodies, as 400s', async () => {
    await expectAppError(await patch({}), 400, 'VALIDATION_ERROR');
    await expectAppError(await patch({ displayName: '   ' }), 400, 'VALIDATION_ERROR');
    await expectAppError(await patch({ displayName: 'x'.repeat(81) }), 400, 'VALIDATION_ERROR');
    await expectAppError(await patch({ preferredUnit: 'stone' }), 400, 'VALIDATION_ERROR');
    // The enum is ('kg','lbs'); 'lb' — the value the RFC snippet guessed — is
    // refused rather than quietly mapped, so wire and column cannot drift.
    await expectAppError(await patch({ preferredUnit: 'lb' }), 400, 'VALIDATION_ERROR');
    await expectAppError(await apiRequest('/api/profile', {
      method: 'PATCH',
      headers: { ...authHeaders(owner), 'Content-Type': 'application/json' },
      body: '{not json',
    }), 400, 'VALIDATION_ERROR');
  });

  it('keeps one user’s preference from reaching another (RLS + explicit scoping)', async () => {
    const foreignView = ProfileResponseSchema.parse(await responseBody(await get(other)));
    expect(foreignView.ok).toBe(true);
    if (foreignView.ok) {
      expect(foreignView.data.userId).toBe(other.userId);
      expect(foreignView.data.preferredUnit).toBe('kg');
      expect(foreignView.data.displayName).toBeNull();
    }
  });

  it('404s with no-store when the profile row is missing, on both verbs', async () => {
    // Reachable state, not a fiction: profiles.id has no FK to auth.users, and
    // nothing re-runs handle_new_user, so a row deleted after sign-in stays
    // deleted. That is the exact shape an old stack can hand this endpoint.
    const orphan = await createTestSession('profile-orphan');
    try {
      await client.query('DELETE FROM profiles WHERE id = $1', [orphan.userId]);

      const response = await get(orphan);
      await expectAppError(response, 404, 'NOT_FOUND');
      expect(response.headers.get('cache-control')).toBe('no-store');

      const patched = await patch({ preferredUnit: 'kg' }, orphan);
      await expectAppError(patched, 404, 'NOT_FOUND');
      expect(patched.headers.get('cache-control')).toBe('no-store');
    } finally {
      await orphan.cleanup();
    }
  });
});
