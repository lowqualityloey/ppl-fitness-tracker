import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { seedExercises } from '../../../db/seed/exercises.js';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { ExerciseProgressResponseSchema } from '../../../lib/contracts/progress.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';
import { requireRow } from '../test-helpers.js';

/**
 * M2-06 (#42): `GET /api/progress/:exerciseSlug`.
 *
 * Fixtures are inserted directly rather than driven through the sync API, so this
 * file tests the *read* path: sets with real load become the e1RM values the
 * formula should produce. `personalRecords` is asserted empty for the same
 * reason — record rows are materialized by the write path's transaction, and a
 * read endpoint that computed its own "best" would be free to disagree with the
 * column the app actually trusts.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

async function seedLoggedSets(client: Client, userId: string, sessionDate: string, sets: Array<{ weight: number; reps: number }>): Promise<void> {
  const session = await client.query<{ id: string }>(
    `INSERT INTO workout_sessions (user_id, routine_day_id, client_id, local_date, status, phase, source, server_seq, started_at)
     VALUES ($1, (SELECT id FROM routine_days WHERE slug = 'push' AND owner_user_id IS NULL),
             gen_random_uuid(), $2, 'archived', 'post_workout', 'app', 0, $3)
     RETURNING id`,
    [userId, sessionDate, `${sessionDate}T12:00:00Z`],
  );
  const sessionId = requireRow(session.rows, 'progress fixture session').id;
  for (const [index, loaded] of sets.entries()) {
    const stampedAt = `${sessionDate}T12:0${index}:00.000Z`;
    await client.query(
      `INSERT INTO session_sets (user_id, session_id, exercise_id, set_index, is_completed, weight_kg, reps, client_ts)
       VALUES ($1, $2, (SELECT id FROM exercises WHERE slug = 'bench-press'), $3, true, $4, $5, $6)`,
      [userId, sessionId, index, loaded.weight, loaded.reps, stampedAt],
    );
  }
}

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('GET /api/progress/:exerciseSlug', () => {
  let owner!: TestSession;
  let other!: TestSession;
  let client!: Client;
  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the progress API suite.');
    await startApiServer();
    await seedExercises(OWNER_URL);
    client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    owner = await createTestSession('progress');
    other = await createTestSession('progress-other');

    // Two sessions, each with a stronger and a weaker set. The endpoint must
    // report the session's best, not its average or its last.
    await seedLoggedSets(client, owner.userId, '2026-08-01', [{ weight: 90, reps: 5 }, { weight: 100, reps: 10 }]);
    await seedLoggedSets(client, owner.userId, '2026-08-08', [{ weight: 105, reps: 5 }]);
    await seedLoggedSets(client, other.userId, '2026-08-01', [{ weight: 150, reps: 20 }]);
  });

  afterAll(async () => {
    if (client) {
      for (const session of [owner, other]) {
        if (!session) continue;
        await client.query('DELETE FROM session_sets WHERE user_id = $1', [session.userId]);
        await client.query('DELETE FROM workout_sessions WHERE user_id = $1', [session.userId]);
      }
      await client.end();
    }
    if (owner) await owner.cleanup();
    if (other) await other.cleanup();
    await stopApiServer();
  });

  it('returns an e1RM trendline and PR history for a valid exercise slug', async () => {
    const response = await apiRequest('/api/progress/bench-press', { headers: authHeaders(owner) });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');

    const parsed = ExerciseProgressResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.ok) return;

    const data = parsed.data.data;
    expect(data.exerciseSlug).toBe('bench-press');
    // Epley, rounded to two decimals: 100 × (1 + 10/30) and 105 × (1 + 5/30).
    expect(data.trendline).toEqual([
      { date: '2026-08-01', e1rm: 133.33, sessionId: expect.any(String) },
      { date: '2026-08-08', e1rm: 122.5, sessionId: expect.any(String) },
    ]);
    expect(data.personalRecords).toEqual([]);
  });

  it('never shows another user\'s logged sets', async () => {
    // The other account has a much heavier bench session. If user scoping were
    // dropped from the read, those numbers would surface here instead of an empty
    // trendline, and the response would still be a valid envelope — so the shape
    // assertion above cannot catch it.
    const response = await apiRequest('/api/progress/bench-press', { headers: authHeaders(other) });
    const parsed = ExerciseProgressResponseSchema.parse(await responseBody(response));
    if (!parsed.ok) throw new Error('Expected a success envelope for the second user.');

    expect(parsed.data.trendline).toEqual([
      { date: '2026-08-01', e1rm: 250, sessionId: expect.any(String) },
    ]);
    expect(parsed.data.trendline.some((point) => point.e1rm === 133.33)).toBe(false);
  });

  it('rejects traversal-shaped exercise slugs with the canonical validation envelope', async () => {
    const response = await apiRequest('/api/progress/%2e%2e%2fsecret', { headers: authHeaders(owner) });
    await expectAppError(response, 400, 'VALIDATION_ERROR');
  });

  it('answers a well-formed unknown slug and someone else\'s private exercise identically', async () => {
    const missing = await apiRequest('/api/progress/not-a-real-lift', { headers: authHeaders(owner) });
    await expectAppError(missing, 404, 'NOT_FOUND');

    // A custom exercise owned by `other` must not be distinguishable from one that
    // does not exist at all: confirming existence is itself a disclosure.
    const privateSlug = `m2-private-${randomUUID().slice(0, 8)}`;
    await client.query(
      `INSERT INTO exercises (slug, name, muscle_groups, equipment, form_tips, video_url,
                              alternatives, kind, duration_seconds, owner_user_id)
       VALUES ($1, 'Private Lift', ARRAY['test'], NULL, NULL, NULL, ARRAY[]::text[], 'strength', NULL, $2)`,
      [privateSlug, other.userId],
    );
    try {
      const response = await apiRequest(`/api/progress/${privateSlug}`, { headers: authHeaders(owner) });
      await expectAppError(response, 404, 'NOT_FOUND');
    } finally {
      await client.query('DELETE FROM exercises WHERE slug = $1', [privateSlug]);
    }
  });

  it('requires an authenticated user', async () => {
    const response = await apiRequest('/api/progress/bench-press');
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });
});
