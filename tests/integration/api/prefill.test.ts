import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { SessionPrefillResponseSchema } from '../../../lib/contracts/sessions.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

/**
 * M3-00 (#57): `GET /api/sessions/prefill?routineDayId=…&excludeSessionId=…`.
 *
 * The behavior under test is a *domain rule*, which is why the answer lives on
 * the server: entries come from the most recent **completed or archived**
 * session for that day — never an in-progress one (a 2026-09-09 warm-up attempt
 * must not overwrite a 2026-09-08 finished workout), never the session being
 * started (`excludeSessionId`), and never another user's.
 *
 * Two omissions are asserted as loudly as the inclusions:
 * an incomplete set, and a completed set whose weight and reps are BOTH null
 * (a legacy-import slot with nothing to remember). Reps-only and weight-only
 * slots survive — dropping them would erase the only number G6 has to prefill.
 *
 * Routing is part of the contract: `/api/sessions/prefill` must be handled by
 * the static segment, not shadowed by `/api/sessions/[id]`. A shadowed route
 * would parse "prefill" as a session UUID and answer 400 forever; so the
 * happy-path 200 below is itself the shadowing proof, and the entry contents
 * could never come from the detail route.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

const exerciseId = randomUUID();
const routineDayId = randomUUID();
const sessions = {
  older: { id: randomUUID(), date: '2026-09-01' },
  newest: { id: randomUUID(), date: '2026-09-08' },
  inProgress: { id: randomUUID(), date: '2026-09-09' },
  foreign: { id: randomUUID(), date: '2026-09-07' },
};

async function seedSet(
  client: Client,
  userId: string,
  sessionId: string,
  setIndex: number,
  weightKg: number | null,
  reps: number | null,
  isCompleted: boolean,
): Promise<void> {
  await client.query(
    `INSERT INTO session_sets (user_id, session_id, exercise_id, set_index, is_completed, weight_kg, reps, client_ts)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [userId, sessionId, exerciseId, setIndex, isCompleted, weightKg, reps],
  );
}

async function seedSession(
  client: Client,
  userId: string,
  id: string,
  localDate: string,
  status: 'in_progress' | 'completed' | 'archived',
): Promise<void> {
  await client.query(
    `INSERT INTO workout_sessions (id, user_id, routine_day_id, client_id, local_date, status, phase, source, server_seq, started_at)
     VALUES ($1, $2, $3, gen_random_uuid(), $4, $5, 'post_workout', 'app', 0, $6)`,
    [id, userId, routineDayId, localDate, status, `${localDate}T12:00:00Z`],
  );
}

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('GET /api/sessions/prefill', () => {
  let owner!: TestSession;
  let other!: TestSession;
  let fresh!: TestSession;
  let client!: Client;

  const get = (query: string, session?: TestSession) =>
    apiRequest(`/api/sessions/prefill${query}`, session ? { headers: authHeaders(session) } : {});

  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the prefill API suite.');
    await startApiServer();
    client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    owner = await createTestSession('prefill');
    other = await createTestSession('prefill-other');
    fresh = await createTestSession('prefill-fresh');

    await client.query(
      `INSERT INTO exercises (id, slug, name, muscle_groups, alternatives, kind, owner_user_id)
       VALUES ($1, $2, 'Prefill Fixture Press', ARRAY['chest'], ARRAY[]::text[], 'strength', NULL)`,
      [exerciseId, `m3-prefill-${exerciseId.slice(0, 8)}`],
    );
    await client.query(
      `INSERT INTO routine_days (id, slug, name, owner_user_id)
       VALUES ($1, $2, 'M3 Prefill Push', NULL)`,
      [routineDayId, `m3-prefill-${routineDayId.slice(0, 8)}`],
    );

    await seedSession(client, owner.userId, sessions.older.id, sessions.older.date, 'archived');
    await seedSet(client, owner.userId, sessions.older.id, 0, 80, 5, true);

    await seedSession(client, owner.userId, sessions.newest.id, sessions.newest.date, 'completed');
    await seedSet(client, owner.userId, sessions.newest.id, 0, 100.5, 3, true);
    await seedSet(client, owner.userId, sessions.newest.id, 1, 90, 2, true);
    await seedSet(client, owner.userId, sessions.newest.id, 2, 200, 1, false); // incomplete → out
    await seedSet(client, owner.userId, sessions.newest.id, 3, null, null, true); // nothing known → out
    await seedSet(client, owner.userId, sessions.newest.id, 4, null, 6, true); // reps-only → IN
    await seedSet(client, owner.userId, sessions.newest.id, 5, 5, null, true); // weight-only → IN

    await seedSession(client, owner.userId, sessions.inProgress.id, sessions.inProgress.date, 'in_progress');
    await seedSet(client, owner.userId, sessions.inProgress.id, 0, 999, 1, true); // newest date, but in_progress → out

    await seedSession(client, other.userId, sessions.foreign.id, sessions.foreign.date, 'archived');
    await seedSet(client, other.userId, sessions.foreign.id, 0, 500, 1, true);
  });

  afterAll(async () => {
    if (client) {
      const users = [owner, other, fresh].filter(Boolean).map((s) => s.userId);
      await client.query('DELETE FROM session_sets WHERE user_id = ANY($1)', [users]);
      await client.query('DELETE FROM workout_sessions WHERE id = ANY($1)', [Object.values(sessions).map((s) => s.id)]);
      await client.query('DELETE FROM routine_days WHERE id = $1', [routineDayId]);
      await client.query('DELETE FROM exercises WHERE id = $1', [exerciseId]);
      await client.query('DELETE FROM profiles WHERE id = ANY($1)', [users]);
      await client.end();
    }
    for (const session of [owner, other, fresh]) {
      if (session) await session.cleanup();
    }
    await stopApiServer();
  });

  it('rejects unauthenticated prefill with the canonical 401', async () => {
    await expectAppError(await get(`?routineDayId=${routineDayId}`), 401, 'UNAUTHENTICATED');
  });

  it('prefills from the most recent completed/archived session, with provenance', async () => {
    const response = await get(`?routineDayId=${routineDayId}`, owner);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const parsed = SessionPrefillResponseSchema.parse(await responseBody(response));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.sourceSessionId).toBe(sessions.newest.id);
      expect(parsed.data.sourceLocalDate).toBe(sessions.newest.date);
      expect(parsed.data.entries).toEqual([
        { exerciseId, setIndex: 0, weightKg: 100.5, reps: 3, sourceLocalDate: sessions.newest.date },
        { exerciseId, setIndex: 1, weightKg: 90, reps: 2, sourceLocalDate: sessions.newest.date },
        { exerciseId, setIndex: 4, weightKg: null, reps: 6, sourceLocalDate: sessions.newest.date },
        { exerciseId, setIndex: 5, weightKg: 5, reps: null, sourceLocalDate: sessions.newest.date },
      ]);
    }
  });

  it('honors excludeSessionId — never prefill from the session being started', async () => {
    const response = await get(
      `?routineDayId=${routineDayId}&excludeSessionId=${sessions.newest.id}`, owner,
    );
    expect(response.status).toBe(200);
    const parsed = SessionPrefillResponseSchema.parse(await responseBody(response));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.sourceSessionId).toBe(sessions.older.id);
      expect(parsed.data.sourceLocalDate).toBe(sessions.older.date);
      expect(parsed.data.entries).toEqual([
        { exerciseId, setIndex: 0, weightKg: 80, reps: 5, sourceLocalDate: sessions.older.date },
      ]);
    }
  });

  it('answers an unknown day or a first-timer with an empty, null-sourced 200', async () => {
    const unknownDay = await get(`?routineDayId=${randomUUID()}`, owner);
    expect(unknownDay.status).toBe(200);
    const unknownParsed = SessionPrefillResponseSchema.parse(await responseBody(unknownDay));
    if (unknownParsed.ok) {
      expect(unknownParsed.data).toEqual({ entries: [], sourceSessionId: null, sourceLocalDate: null });
    }

    const firstTimer = await get(`?routineDayId=${routineDayId}`, fresh);
    expect(firstTimer.status).toBe(200);
    const freshParsed = SessionPrefillResponseSchema.parse(await responseBody(firstTimer));
    expect(freshParsed.ok).toBe(true);
  });

  it('never shows one user the heavier lifts of another', async () => {
    const response = await get(`?routineDayId=${routineDayId}`, other);
    const parsed = SessionPrefillResponseSchema.parse(await responseBody(response));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.sourceSessionId).toBe(sessions.foreign.id);
      expect(parsed.data.entries).toEqual([
        { exerciseId, setIndex: 0, weightKg: 500, reps: 1, sourceLocalDate: sessions.foreign.date },
      ]);
    }
    // And the owner's answer never contains the other user's load. Asserted on
    // the *field*: a whole-body substring check would false-fail whenever a
    // random UUID happens to contain "500".
    const mine = SessionPrefillResponseSchema.parse(await responseBody(
      await get(`?routineDayId=${routineDayId}`, owner),
    ));
    if (mine.ok) {
      expect(mine.data.sourceSessionId).not.toBe(sessions.foreign.id);
      expect(mine.data.entries.map((e) => e.weightKg)).not.toContain(500);
    }
  });

  it('rejects malformed queries as 400s and never as a detail-route id error', async () => {
    // If the static segment were shadowed by [id], these would fail on "id";
    // they must fail as prefill-query violations. Status is the shared
    // envelope, so the happy-path 200 above is the load-bearing half.
    await expectAppError(await get('', owner), 400, 'VALIDATION_ERROR');
    await expectAppError(await get('?routineDayId=not-a-uuid', owner), 400, 'VALIDATION_ERROR');
    await expectAppError(await get(`?routineDayId=${routineDayId}&since=0`, owner), 400, 'VALIDATION_ERROR');
    await expectAppError(await get(`?routineDayId=${routineDayId}&excludeSessionId=zzz`, owner), 400, 'VALIDATION_ERROR');
  });
});
