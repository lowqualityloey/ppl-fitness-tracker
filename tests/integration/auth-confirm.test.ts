import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { CookieJar, createClientFromCookieJar } from '../../lib/supabase/cookie-jar.js';
import { requireUser } from '../../lib/auth/require-user.js';
import { confirmQuerySchema } from '../../lib/auth/magic-link.js';
import { validationError } from '../../lib/contracts/envelope.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const TEST_EMAIL = 'auth-confirm-m1-13@example.com';

interface AdminUser { id: string }
interface GeneratedLink { hashed_token?: string }

function isAdminUser(value: unknown): value is AdminUser {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

function isGeneratedLink(value: unknown): value is GeneratedLink {
  return typeof value === 'object' && value !== null;
}

describe('M1-13: magic-link confirmation', () => {
  let owner: Client;
  let userId: string;

  beforeAll(async () => {
    owner = new Client({ connectionString: OWNER_URL });
    await owner.connect();
    await owner.query('DELETE FROM auth.users WHERE email = $1', [TEST_EMAIL]);
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, email_confirm: true }),
    });
    const body: unknown = await response.json();
    if (!response.ok || !isAdminUser(body)) throw new Error('Could not create magic-link test user');
    userId = body.id;
  });

  afterAll(async () => {
    await owner.query('DELETE FROM auth.users WHERE email = $1', [TEST_EMAIL]);
    await owner.end();
  });

  it('verifies a real GoTrue token hash and persists an SSR session cookie', async () => {
    const generated = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', email: TEST_EMAIL }),
    });
    const body: unknown = await generated.json();
    if (!generated.ok || !isGeneratedLink(body) || !body.hashed_token) {
      throw new Error('GoTrue did not return a magic-link token hash');
    }

    const jar = new CookieJar();
    const client = createClientFromCookieJar(jar);
    const { error } = await client.auth.verifyOtp({ token_hash: body.hashed_token, type: 'email' });
    expect(error).toBeNull();
    expect(jar.getAll()).not.toEqual([]);
    await expect(requireUser(createClientFromCookieJar(jar))).resolves.toEqual({ userId });
  });

  it('rejects malformed callback parameters with the 400 envelope shape', () => {
    expect(confirmQuerySchema.safeParse({ token_hash: '', type: 'email' }).success).toBe(false);
    expect(confirmQuerySchema.safeParse({ token_hash: 'valid-looking', type: 'magiclink' }).success).toBe(false);
    expect(validationError()).toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });
});
