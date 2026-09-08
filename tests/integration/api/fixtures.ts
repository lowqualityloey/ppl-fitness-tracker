import { randomUUID } from 'node:crypto';
import { CookieJar, createClientFromCookieJar } from '../../../lib/supabase/server.js';

export const ids = {
  mutation: '11111111-1111-4111-8111-111111111111',
  session: '22222222-2222-4222-8222-222222222222',
  exercise: '33333333-3333-4333-8333-333333333333',
  device: '44444444-4444-4444-8444-444444444444',
  routineDay: '55555555-5555-4555-8555-555555555555',
};

export const clientTs = '2026-09-08T12:00:00.000Z';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const TEST_PASSWORD = 'm1-16-route-test-password';

process.env.NEXT_PUBLIC_SUPABASE_URL ??= SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= SUPABASE_ANON_KEY;

interface TestSession {
  userId: string;
  cookie: string;
  cleanup: () => Promise<void>;
}

function hasId(value: unknown): value is { id: string } {
  return typeof value === 'object' && value !== null &&
    typeof (value as { id?: unknown }).id === 'string';
}

export async function createTestSession(label: string): Promise<TestSession> {
  const email = `m1-16-${label}-${randomUUID()}@example.com`;
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  const createdBody: unknown = await created.json();
  if (!created.ok || !hasId(createdBody)) {
    throw new Error(`Could not create M1-16 test user (${created.status}).`);
  }

  const userId = createdBody.id;
  const jar = new CookieJar();
  const client = createClientFromCookieJar(jar);
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`Could not sign in M1-16 test user: ${error.message}`);

  return {
    userId,
    cookie: jar.getAll().map(({ name, value }) => `${name}=${value}`).join('; '),
    cleanup: async () => {
      const removed = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
      });
      if (!removed.ok) throw new Error(`Could not clean up M1-16 test user (${removed.status}).`);
    },
  };
}

export function authHeaders(session: TestSession): HeadersInit {
  return { Cookie: session.cookie };
}

export type { TestSession };
