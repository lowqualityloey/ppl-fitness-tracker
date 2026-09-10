import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { seedExercises } from '../../../db/seed/exercises.js';
import { ExercisesListResponseSchema } from '../../../lib/contracts/exercises.js';
import { createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

/**
 * M2-06 (#42): `GET /api/exercises`. Seeded content is a precondition, so
 * `beforeAll` seeds it — CI has no seed step, and a suite that only checked the
 * envelope would pass against an empty library.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

describe('GET /api/exercises', () => {
  let owner!: TestSession;

  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the exercises API suite.');
    await startApiServer();
    await seedExercises(OWNER_URL);
    owner = await createTestSession('exercises');
  });

  afterAll(async () => {
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('returns the seeded library in the canonical envelope and advertises one-hour cacheability', async () => {
    const response = await apiRequest('/api/exercises');
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=3600');

    const parsed = ExercisesListResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (!parsed.success || !parsed.data.ok) return;

    const slugs = parsed.data.data.exercises.map((exercise) => exercise.slug);
    expect(slugs.length).toBeGreaterThanOrEqual(18);
    expect(slugs).toContain('bench-press');
    expect(slugs).toContain('push-ups');
  });

  it('excludes another user\'s custom exercise from the public library', async () => {
    // This route has no auth check at all, so isolation rests entirely on the
    // `owner_user_id IS NULL` predicate. That makes this the control that fails if
    // the predicate is ever dropped: a private row must not appear here.
    const customSlug = `m2-private-${randomUUID().slice(0, 8)}`;
    const client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    try {
      await client.query(
        `INSERT INTO exercises (slug, name, muscle_groups, equipment, form_tips, video_url,
                                alternatives, kind, duration_seconds, owner_user_id)
         VALUES ($1, 'Private Custom Exercise', ARRAY['test'], NULL, NULL, NULL,
                 ARRAY[]::text[], 'strength', NULL, $2)`,
        [customSlug, owner.userId],
      );

      const response = await apiRequest('/api/exercises');
      const body = ExercisesListResponseSchema.parse(await responseBody(response));
      if (!body.ok) throw new Error(`Expected a success envelope, got ${body.error.code}.`);
      expect(body.data.exercises.map((exercise) => exercise.slug)).not.toContain(customSlug);
    } finally {
      await client.query('DELETE FROM exercises WHERE slug = $1', [customSlug]);
      await client.end();
    }
  });

  it('rejects unexpected query parameters instead of ignoring them', async () => {
    const response = await apiRequest('/api/exercises?userId=someone-else');
    expect(response.status).toBe(400);
  });
});
