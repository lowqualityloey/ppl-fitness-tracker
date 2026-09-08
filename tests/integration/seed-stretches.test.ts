import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { seedExercises, exerciseSeedRows } from '../../db/seed/exercises';
import { seedStretches, stretchSeedRows } from '../../db/seed/stretches';

const connectionString = process.env.MIGRATION_DATABASE_URL;

const expectedByDay = {
  push: [
    'Chest Doorway Stretch',
    'Overhead Tricep Stretch',
    'Cross-body Shoulder Stretch',
    "Child's Pose",
    'Cat-Cow Stretch',
  ],
  legs: [
    'Standing Quad Stretch',
    'Standing Hamstring Stretch',
    'Hip Flexor Stretch',
    'Calf Stretch',
    'Pigeon Pose',
  ],
  pull: [
    'Lat Stretch',
    'Bicep Wall Stretch',
    'Upper Trap Stretch',
    "Child's Pose",
    'Cat-Cow Stretch',
  ],
} as const;

const expectedContent = [
  {
    slug: 'chest-doorway-stretch',
    name: 'Chest Doorway Stretch',
    duration_seconds: 30,
    form_tips: 'Stand in doorway, place forearms on frame, lean forward gently',
    beginner_notes: 'Should feel stretch across chest and front shoulders',
    video_url: 'https://www.youtube.com/embed/PWGuI3rTRx0',
  },
  {
    slug: 'overhead-tricep-stretch',
    name: 'Overhead Tricep Stretch',
    duration_seconds: 30,
    form_tips: 'Reach one arm overhead, pull elbow with other hand',
    beginner_notes: "Don't force the stretch, gentle pressure only",
    video_url: 'https://www.youtube.com/embed/_IOHtPSYGbk',
  },
  {
    slug: 'cross-body-shoulder-stretch',
    name: 'Cross-body Shoulder Stretch',
    duration_seconds: 30,
    form_tips: 'Pull arm across chest, hold at elbow',
    beginner_notes: 'Gentle pull across body, feel stretch in back of shoulder',
    video_url: 'https://www.youtube.com/embed/aIq0fLi8iak',
  },
  {
    slug: 'childs-pose',
    name: "Child's Pose",
    duration_seconds: 45,
    form_tips: 'Kneel, sit back on heels, reach arms forward',
    beginner_notes: 'Relax and breathe deeply, let your back stretch',
    video_url: 'https://www.youtube.com/embed/AgwjXQJqfYo',
  },
  {
    slug: 'cat-cow-stretch',
    name: 'Cat-Cow Stretch',
    duration_seconds: 30,
    form_tips: 'On hands and knees, alternate arching and rounding back',
    beginner_notes: 'Move slowly, coordinate with breathing',
    video_url: 'https://www.youtube.com/embed/LIVJZZyZ2qM',
  },
  {
    slug: 'standing-quad-stretch',
    name: 'Standing Quad Stretch',
    duration_seconds: 30,
    form_tips: 'Pull foot to glutes, hold ankle, use wall for balance',
    beginner_notes: 'Feel stretch in front of thigh',
    video_url: 'https://www.youtube.com/embed/IwB89iBDLbM',
  },
  {
    slug: 'standing-hamstring-stretch',
    name: 'Standing Hamstring Stretch',
    duration_seconds: 30,
    form_tips: 'Place heel on bench, lean forward slightly',
    beginner_notes: 'Keep leg straight, feel stretch in back of thigh',
    video_url: 'https://www.youtube.com/embed/qQ26F282VRo',
  },
  {
    slug: 'hip-flexor-stretch',
    name: 'Hip Flexor Stretch',
    duration_seconds: 30,
    form_tips: 'Lunge position, push hips forward',
    beginner_notes: 'Feel stretch in front of hip',
    video_url: 'https://www.youtube.com/embed/ktgtEWGhFd8',
  },
  {
    slug: 'calf-stretch',
    name: 'Calf Stretch',
    duration_seconds: 30,
    form_tips: 'Step back, press heel down, lean forward',
    beginner_notes: 'Keep back leg straight',
    video_url: 'https://www.youtube.com/embed/mafo7o7OnFo',
  },
  {
    slug: 'pigeon-pose',
    name: 'Pigeon Pose',
    duration_seconds: 45,
    form_tips: 'Bring one leg forward bent, extend other leg back',
    beginner_notes: 'Breathe deeply, feel hip stretch',
    video_url: 'https://www.youtube.com/embed/1o7awuDGzag',
  },
  {
    slug: 'lat-stretch',
    name: 'Lat Stretch',
    duration_seconds: 30,
    form_tips: 'Reach one arm overhead and lean to opposite side',
    beginner_notes: 'Feel stretch along side of back and armpit area',
    video_url: 'https://www.youtube.com/embed/x97hAScVHHc',
  },
  {
    slug: 'bicep-wall-stretch',
    name: 'Bicep Wall Stretch',
    duration_seconds: 30,
    form_tips: 'Place palm on wall behind you, step forward gently',
    beginner_notes: "Don't force it - gentle stretch in front of arm",
    video_url: 'https://www.youtube.com/embed/j0rdJpN4B8Y',
  },
  {
    slug: 'upper-trap-stretch',
    name: 'Upper Trap Stretch',
    duration_seconds: 30,
    form_tips: 'Tilt head to side, pull gently with opposite hand',
    beginner_notes: 'Feel stretch in neck and upper shoulder area',
    video_url: 'https://www.youtube.com/embed/dWICLaovAVc',
  },
] as const;

describe('M1-10: legacy stretch seed', () => {
  let client: Client;

  beforeAll(async () => {
    if (!connectionString) {
      throw new Error('MIGRATION_DATABASE_URL is required for seed integration tests');
    }

    await seedExercises(connectionString);
    await seedStretches(connectionString);
    client = new Client({ connectionString });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it('seeds exactly 13 unique system stretch rows', async () => {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM exercises
       WHERE owner_user_id IS NULL
         AND kind = 'stretch'
         AND slug = ANY($1::text[])`,
      [stretchSeedRows.map((stretch) => stretch.slug)],
    );
    expect(result.rows[0]?.count).toBe('13');

    const rows = await client.query<{
      slug: string;
      name: string;
      kind: string;
      duration_seconds: number;
      equipment: string | null;
      muscle_groups: string[];
      alternatives: string[];
      form_tips: string;
      beginner_notes: string;
      video_url: string;
    }>(
      `SELECT slug, name, kind, duration_seconds, equipment, muscle_groups,
              alternatives, form_tips, beginner_notes, video_url
       FROM exercises
       WHERE owner_user_id IS NULL
         AND slug = ANY($1::text[])
       ORDER BY slug`,
      [stretchSeedRows.map((stretch) => stretch.slug)],
    );

    const expected = [...expectedContent].sort((a, b) => a.slug.localeCompare(b.slug));
    expect(rows.rows).toHaveLength(13);
    expect(rows.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      duration_seconds: row.duration_seconds,
      form_tips: row.form_tips,
      beginner_notes: row.beginner_notes,
      video_url: row.video_url,
    }))).toEqual(expected);
    expect(rows.rows.every((row) => row.kind === 'stretch')).toBe(true);
    expect(rows.rows.every((row) => row.equipment === null)).toBe(true);
    expect(rows.rows.every((row) => row.muscle_groups.length === 0)).toBe(true);
    expect(rows.rows.every((row) => row.alternatives.length === 0)).toBe(true);
  });

  it('preserves five ordered placements per day and shared content IDs', async () => {
    for (const daySlug of Object.keys(expectedByDay) as Array<keyof typeof expectedByDay>) {
      const result = await client.query<{ name: string; phase: string; order_index: number }>(
        `SELECT e.name, re.phase, re.order_index
         FROM routine_exercises re
         JOIN routine_days rd ON rd.id = re.routine_day_id
         JOIN exercises e ON e.id = re.exercise_id
         WHERE rd.slug = $1 AND e.kind = 'stretch'
         ORDER BY re.order_index`,
        [daySlug],
      );
      expect(result.rows).toHaveLength(5);
      expect(result.rows.map((row) => row.name)).toEqual(expectedByDay[daySlug]);
      expect(result.rows.every((row) => row.phase === 'stretch')).toBe(true);
      expect(result.rows.map((row) => row.order_index)).toEqual([0, 1, 2, 3, 4]);
    }

    const shared = await client.query<{ slug: string; routine_day: string; id: string }>(
      `SELECT e.slug, rd.slug AS routine_day, e.id
       FROM exercises e
       JOIN routine_exercises re ON re.exercise_id = e.id
       JOIN routine_days rd ON rd.id = re.routine_day_id
       WHERE e.slug = ANY($1::text[])
       ORDER BY e.slug, rd.slug`,
      [['childs-pose', 'cat-cow-stretch']],
    );
    expect(shared.rows).toHaveLength(4);
    expect(shared.rows.map((row) => `${row.slug}:${row.routine_day}`)).toEqual([
      'cat-cow-stretch:pull',
      'cat-cow-stretch:push',
      'childs-pose:pull',
      'childs-pose:push',
    ]);
    expect(new Set(shared.rows.filter((row) => row.slug === 'cat-cow-stretch').map((row) => row.id)).size).toBe(1);
    expect(new Set(shared.rows.filter((row) => row.slug === 'childs-pose').map((row) => row.id)).size).toBe(1);

    const total = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM routine_exercises re
       JOIN exercises e ON e.id = re.exercise_id
       WHERE e.slug = ANY($1::text[])`,
      [stretchSeedRows.map((stretch) => stretch.slug)],
    );
    expect(total.rows[0]?.count).toBe('15');

    const combined = await client.query<{ kind: string; count: string }>(
      `SELECT e.kind, count(*)::text AS count
       FROM routine_exercises re
       JOIN exercises e ON e.id = re.exercise_id
       WHERE e.slug = ANY($1::text[])
       GROUP BY e.kind
       ORDER BY e.kind`,
      [[
        ...exerciseSeedRows.map((exercise) => exercise.slug),
        ...stretchSeedRows.map((stretch) => stretch.slug),
      ]],
    );
    expect(Object.fromEntries(combined.rows.map((row) => [row.kind, row.count]))).toEqual({
      stretch: '15',
      strength: '18',
    });
  });

  it('is idempotent and repairs stale canonical placements', async () => {
    const before = await client.query<{ slug: string; id: string }>(
      `SELECT slug, id
       FROM exercises
       WHERE slug = ANY($1::text[])
       ORDER BY slug`,
      [stretchSeedRows.map((stretch) => stretch.slug)],
    );
    const associationsBefore = await client.query<{ slug: string; day: string; order_index: number }>(
      `SELECT e.slug, rd.slug AS day, re.order_index
       FROM routine_exercises re
       JOIN exercises e ON e.id = re.exercise_id
       JOIN routine_days rd ON rd.id = re.routine_day_id
       WHERE e.slug = ANY($1::text[])
       ORDER BY e.slug, day`,
      [stretchSeedRows.map((stretch) => stretch.slug)],
    );

    await seedStretches(connectionString);

    const after = await client.query<{ slug: string; id: string }>(
      `SELECT slug, id
       FROM exercises
       WHERE slug = ANY($1::text[])
       ORDER BY slug`,
      [stretchSeedRows.map((stretch) => stretch.slug)],
    );
    const associationsAfter = await client.query<{ slug: string; day: string; order_index: number }>(
      `SELECT e.slug, rd.slug AS day, re.order_index
       FROM routine_exercises re
       JOIN exercises e ON e.id = re.exercise_id
       JOIN routine_days rd ON rd.id = re.routine_day_id
       WHERE e.slug = ANY($1::text[])
       ORDER BY e.slug, day`,
      [stretchSeedRows.map((stretch) => stretch.slug)],
    );
    expect(after.rows).toEqual(before.rows);
    expect(associationsAfter.rows).toEqual(associationsBefore.rows);

    const moved = await client.query(
      `UPDATE routine_exercises
       SET order_index = 99
       WHERE routine_day_id = (SELECT id FROM routine_days WHERE slug = 'push')
         AND exercise_id = (SELECT id FROM exercises WHERE slug = 'chest-doorway-stretch')
         AND phase = 'stretch'`,
    );
    expect(moved.rowCount).toBe(1);

    await seedStretches(connectionString);

    const repaired = await client.query<{ order_index: number }>(
      `SELECT re.order_index
       FROM routine_exercises re
       JOIN routine_days rd ON rd.id = re.routine_day_id
       JOIN exercises e ON e.id = re.exercise_id
       WHERE rd.slug = 'push' AND e.slug = 'chest-doorway-stretch' AND re.phase = 'stretch'`,
    );
    expect(repaired.rows).toEqual([{ order_index: 0 }]);
  });
});
