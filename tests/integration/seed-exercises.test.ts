import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { exerciseSeedRows, seedExercises } from '../../db/seed/exercises';
import { requireRow } from './test-helpers.js';

const connectionString = process.env.MIGRATION_DATABASE_URL;

interface CountRow {
  count: string;
}

const expectedByDay = {
  push: [
    'Bench Press',
    'Dumbbell Overhead Press',
    'Chest Press Machine',
    'Lateral Raises',
    'Cable Tricep Pushdowns',
    'Push-ups',
  ],
  legs: [
    'Goblet Squats',
    'Leg Press',
    'Romanian Deadlifts',
    'Leg Curls',
    'Leg Extensions',
    'Calf Raises',
  ],
  pull: [
    'Lat Pulldown',
    'Seated Cable Row',
    'Single-Arm Dumbbell Row',
    'Face Pulls',
    'Bicep Curls',
    'Hammer Curls',
  ],
} as const;

const expectedProgrammingByDay = {
  push: [
    { targetSets: 3, targetReps: 8, targetRepsRange: '8-10', restTime: '60-90s' },
    { targetSets: 3, targetReps: 8, targetRepsRange: '8-10', restTime: '60-90s' },
    { targetSets: 3, targetReps: 10, targetRepsRange: '10-12', restTime: '60-90s' },
    { targetSets: 3, targetReps: 12, targetRepsRange: '12-15', restTime: '60-90s' },
    { targetSets: 3, targetReps: 10, targetRepsRange: '10-12', restTime: '60-90s' },
    { targetSets: 2, targetReps: 8, targetRepsRange: '8-12', restTime: '60-90s' },
  ],
  legs: [
    { targetSets: 3, targetReps: 8, targetRepsRange: '8-10', restTime: '60-90s' },
    { targetSets: 3, targetReps: 8, targetRepsRange: '8-10', restTime: '60-90s' },
    { targetSets: 3, targetReps: 10, targetRepsRange: '10-12', restTime: '60-90s' },
    { targetSets: 3, targetReps: 12, targetRepsRange: '12-15', restTime: '60-90s' },
    { targetSets: 3, targetReps: 10, targetRepsRange: '10-12', restTime: '60-90s' },
    { targetSets: 2, targetReps: 12, targetRepsRange: '12-15', restTime: '60s' },
  ],
  pull: [
    { targetSets: 3, targetReps: 8, targetRepsRange: '8-10', restTime: '90s' },
    { targetSets: 3, targetReps: 8, targetRepsRange: '8-10', restTime: '90s' },
    { targetSets: 3, targetReps: 10, targetRepsRange: '10-12', restTime: '75s' },
    { targetSets: 3, targetReps: 12, targetRepsRange: '12-15', restTime: '60s' },
    { targetSets: 3, targetReps: 10, targetRepsRange: '10-12', restTime: '75s' },
    { targetSets: 2, targetReps: 8, targetRepsRange: '8-12', restTime: '60s' },
  ],
} as const;

describe('M1-09: legacy exercise seed', () => {
  let client: Client;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error('MIGRATION_DATABASE_URL is required for seed integration tests');
    }

    await seedExercises(connectionString);
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('seeds exactly the 18 canonical system exercises', async () => {
    const result = await client.query<CountRow>(
      `SELECT count(*)::text AS count
       FROM exercises
       WHERE owner_user_id IS NULL
         AND slug = ANY($1::text[])`,
      [exerciseSeedRows.map((exercise) => exercise.slug)],
    );

    expect(requireRow(result.rows, 'canonical exercise count').count).toBe('18');

    const rows = await client.query<{ slug: string; name: string }>(
      `SELECT slug, name
       FROM exercises
       WHERE owner_user_id IS NULL
         AND slug = ANY($1::text[])
       ORDER BY slug`,
      [exerciseSeedRows.map((exercise) => exercise.slug)],
    );
    expect(rows.rows).toHaveLength(18);
    expect(new Set(rows.rows.map((row) => row.slug)).size).toBe(18);
  });

  it('preserves day order, text ranges, rest values, and source fields', async () => {
    for (const daySlug of Object.keys(expectedByDay) as Array<keyof typeof expectedByDay>) {
      const result = await client.query<{
        name: string;
        phase: string;
        order_index: number;
        target_sets: number;
        target_reps: number;
        target_reps_range: string;
        rest_time: string;
      }>(
        `SELECT e.name, re.phase, re.order_index, re.target_sets, re.target_reps,
                re.target_reps_range, re.rest_time
         FROM routine_exercises re
         JOIN routine_days rd ON rd.id = re.routine_day_id
         JOIN exercises e ON e.id = re.exercise_id
         WHERE rd.slug = $1 AND e.kind = 'strength'
         ORDER BY re.order_index`,
        [daySlug],
      );

      expect(result.rows).toHaveLength(6);
      expect(result.rows.map((row) => row.name)).toEqual(expectedByDay[daySlug]);
      expect(result.rows.every((row) => row.phase === 'main_workout')).toBe(true);
      expect(result.rows.map((row) => row.order_index)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(result.rows.map((row) => ({
        targetSets: row.target_sets,
        targetReps: row.target_reps,
        targetRepsRange: row.target_reps_range,
        restTime: row.rest_time,
      }))).toEqual(expectedProgrammingByDay[daySlug]);
    }

    const pushRows = await client.query<{
      equipment: string | null;
      alternatives: string[];
      form_tips: string;
    }>(
      `SELECT equipment, alternatives, form_tips
       FROM exercises
       WHERE slug = 'bench-press'`,
    );
    expect(requireRow(pushRows.rows, 'bench press seed metadata')).toMatchObject({
      equipment: null,
      alternatives: [],
      form_tips: "Keep feet flat on floor, controlled movement, don't bounce off chest",
    });

    const pullRows = await client.query<{
      equipment: string;
      beginner_notes: string;
      alternatives: string[];
    }>(
      `SELECT equipment, beginner_notes, alternatives
       FROM exercises
       WHERE slug = 'lat-pulldown'`,
    );
    expect(requireRow(pullRows.rows, 'lat pulldown seed metadata')).toMatchObject({
      equipment: 'Cable Machine with Lat Bar',
      beginner_notes: 'Start light, focus on pulling with your back muscles, not just arms',
      alternatives: [
        'Pull-ups (if you can do them)',
        'Assisted Pull-up Machine',
        'Resistance Band Pulldowns',
      ],
    });
  });

  it('is idempotent and repairs stale canonical associations', async () => {
    const before = await client.query<{ slug: string; id: string }>(
      `SELECT id, slug
       FROM exercises
       WHERE slug = ANY($1::text[])
       ORDER BY slug`,
      [exerciseSeedRows.map((exercise) => exercise.slug)],
    );

    await seedExercises(connectionString);

    const after = await client.query<{ slug: string; id: string }>(
      `SELECT id, slug
       FROM exercises
       WHERE slug = ANY($1::text[])
       ORDER BY slug`,
      [exerciseSeedRows.map((exercise) => exercise.slug)],
    );

    expect(after.rows).toEqual(before.rows);

    const moved = await client.query(
      `UPDATE routine_exercises
       SET order_index = 99
       WHERE routine_day_id = (SELECT id FROM routine_days WHERE slug = 'push')
         AND exercise_id = (SELECT id FROM exercises WHERE slug = 'bench-press')
         AND phase = 'main_workout'`,
    );
    expect(moved.rowCount).toBe(1);

    await seedExercises(connectionString);

    const repaired = await client.query<{ order_index: number }>(
      `SELECT re.order_index
       FROM routine_exercises re
       JOIN routine_days rd ON rd.id = re.routine_day_id
       JOIN exercises e ON e.id = re.exercise_id
       WHERE rd.slug = 'push' AND e.slug = 'bench-press' AND re.phase = 'main_workout'`,
    );
    expect(repaired.rows).toEqual([{ order_index: 0 }]);

    const associationCount = await client.query<CountRow>(
      `SELECT count(*)::text AS count
       FROM routine_exercises re
       JOIN routine_days rd ON rd.id = re.routine_day_id
       JOIN exercises e ON e.id = re.exercise_id
       WHERE rd.slug = ANY($1::text[])
         AND e.kind = 'strength'`,
      [['push', 'legs', 'pull']],
    );
    expect(requireRow(associationCount.rows, 'exercise association count').count).toBe('18');
  });
});
