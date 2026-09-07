/**
 * Applies sql/001-setup.sql, then seeds two real GoTrue users and one
 * session_sets row each.
 *
 * Users are created through the GoTrue Admin API rather than by hand-inserting
 * into auth.users, and the JWT claims used in the tests are the *decoded
 * payload of a token GoTrue actually issued*. Synthesising a claims object by
 * hand would leave the spike proving that our own fixture matches our own
 * policy, which is circular.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import {
  OWNER_URL,
  SERVICE_ROLE_KEY,
  ANON_KEY,
  SUPABASE_API_URL,
  type JwtClaims,
} from './db.js';

export interface SeededUser {
  id: string;
  email: string;
  claims: JwtClaims;
  accessToken: string;
  /** id of the session_sets row owned by this user */
  setId: string;
}

export interface Fixtures {
  userA: SeededUser;
  userB: SeededUser;
}

const PASSWORD = 'spike-password-not-a-secret-123';
const EMAILS = ['spike-a@example.com', 'spike-b@example.com'] as const;

function decodeJwtPayload(token: string): JwtClaims {
  const part = token.split('.')[1];
  if (!part) throw new Error('malformed JWT');
  const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return JSON.parse(json) as JwtClaims;
}

async function adminDeleteAllSpikeUsers(owner: Client): Promise<void> {
  // ON DELETE CASCADE from profiles and session_sets makes this a full reset.
  await owner.query(`DELETE FROM auth.users WHERE email = ANY($1::text[])`, [[...EMAILS]]);
}

async function createUser(email: string): Promise<{ id: string; accessToken: string; claims: JwtClaims }> {
  const created = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  if (!created.ok) {
    throw new Error(`admin createUser failed (${created.status}): ${await created.text()}`);
  }
  const user = (await created.json()) as { id: string };

  const signedIn = await fetch(`${SUPABASE_API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!signedIn.ok) {
    throw new Error(`password grant failed (${signedIn.status}): ${await signedIn.text()}`);
  }
  const session = (await signedIn.json()) as { access_token: string };

  const claims = decodeJwtPayload(session.access_token);
  if (claims.sub !== user.id) {
    throw new Error(`JWT sub ${claims.sub} does not match created user id ${user.id}`);
  }
  return { id: user.id, accessToken: session.access_token, claims };
}

export async function resetAndSeed(): Promise<Fixtures> {
  const owner = new Client({ connectionString: OWNER_URL });
  await owner.connect();
  try {
    const ddl = await readFile(
      fileURLToPath(new URL('../sql/001-setup.sql', import.meta.url)),
      'utf8',
    );
    await owner.query(ddl);

    await adminDeleteAllSpikeUsers(owner);

    const [a, b] = await Promise.all([createUser(EMAILS[0]), createUser(EMAILS[1])]);

    // The handle_new_user trigger should already have made both profiles.
    const profileCount = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.profiles WHERE id = ANY($1::uuid[])`,
      [[a.id, b.id]],
    );
    if (profileCount.rows[0]!.count !== '2') {
      throw new Error(
        `handle_new_user trigger did not fire: expected 2 profiles, got ${profileCount.rows[0]!.count}`,
      );
    }

    // Seed as owner (BYPASSRLS) so the rows exist regardless of policy state.
    const inserted = await owner.query<{ id: string; user_id: string }>(
      `INSERT INTO public.session_sets (user_id, exercise_slug, set_index, is_completed, weight_kg, reps)
       VALUES ($1, 'bench-press', 0, true, 60.00, 8),
              ($2, 'bench-press', 0, true, 80.00, 5)
       RETURNING id, user_id`,
      [a.id, b.id],
    );
    const setFor = (uid: string) => {
      const row = inserted.rows.find((r) => r.user_id === uid);
      if (!row) throw new Error(`no seeded set for ${uid}`);
      return row.id;
    };

    // No FK, so the auth.users cascade above does not clear it.
    await owner.query(`TRUNCATE public.unprotected_future_table`);
    await owner.query(
      `INSERT INTO public.unprotected_future_table (user_id, secret)
       VALUES ($1, 'A private note'), ($2, 'B private note')`,
      [a.id, b.id],
    );

    return {
      userA: { ...a, email: EMAILS[0], setId: setFor(a.id) },
      userB: { ...b, email: EMAILS[1], setId: setFor(b.id) },
    };
  } finally {
    await owner.end();
  }
}
