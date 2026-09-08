import { resolve } from 'node:path';
import { Client } from 'pg';
import { routineDaySeedRows } from './exercises';

type StretchPlacement = {
  routineSlug: 'push' | 'legs' | 'pull';
  orderIndex: number;
};

type StretchSeed = {
  slug: string;
  name: string;
  durationSeconds: number;
  instructions: string;
  tip: string;
  videoUrl: string;
  placements: readonly StretchPlacement[];
};

/**
 * Stretch source decisions:
 * - Stretch content uses kind=stretch and duration_seconds. It does not use
 *   strength target reps or rest_time as compatibility placeholders.
 * - Child's Pose appears in Push and Pull with different tip text. The Pull
 *   app.js wording is canonical because it is the structured source; the Push
 *   wording "let body sink into position" is intentionally discarded.
 * - Cat-Cow is identical in both sources; the Pull structured copy is kept
 *   for consistency with Child's Pose, with no content loss.
 * - No stretch source supplies equipment or muscle groups, so those fields
 *   remain NULL/empty rather than being inferred.
 */
export const stretchSeedRows: readonly StretchSeed[] = [
  {
    slug: 'chest-doorway-stretch',
    name: 'Chest Doorway Stretch',
    durationSeconds: 30,
    instructions: 'Stand in doorway, place forearms on frame, lean forward gently',
    tip: 'Should feel stretch across chest and front shoulders',
    videoUrl: 'https://www.youtube.com/embed/PWGuI3rTRx0',
    placements: [{ routineSlug: 'push', orderIndex: 0 }],
  },
  {
    slug: 'overhead-tricep-stretch',
    name: 'Overhead Tricep Stretch',
    durationSeconds: 30,
    instructions: 'Reach one arm overhead, pull elbow with other hand',
    tip: "Don't force the stretch, gentle pressure only",
    videoUrl: 'https://www.youtube.com/embed/_IOHtPSYGbk',
    placements: [{ routineSlug: 'push', orderIndex: 1 }],
  },
  {
    slug: 'cross-body-shoulder-stretch',
    name: 'Cross-body Shoulder Stretch',
    durationSeconds: 30,
    instructions: 'Pull arm across chest, hold at elbow',
    tip: 'Gentle pull across body, feel stretch in back of shoulder',
    videoUrl: 'https://www.youtube.com/embed/aIq0fLi8iak',
    placements: [{ routineSlug: 'push', orderIndex: 2 }],
  },
  {
    slug: 'childs-pose',
    name: "Child's Pose",
    durationSeconds: 45,
    instructions: 'Kneel, sit back on heels, reach arms forward',
    tip: 'Relax and breathe deeply, let your back stretch',
    videoUrl: 'https://www.youtube.com/embed/AgwjXQJqfYo',
    placements: [
      { routineSlug: 'push', orderIndex: 3 },
      { routineSlug: 'pull', orderIndex: 3 },
    ],
  },
  {
    slug: 'cat-cow-stretch',
    name: 'Cat-Cow Stretch',
    durationSeconds: 30,
    instructions: 'On hands and knees, alternate arching and rounding back',
    tip: 'Move slowly, coordinate with breathing',
    videoUrl: 'https://www.youtube.com/embed/LIVJZZyZ2qM',
    placements: [
      { routineSlug: 'push', orderIndex: 4 },
      { routineSlug: 'pull', orderIndex: 4 },
    ],
  },
  {
    slug: 'standing-quad-stretch',
    name: 'Standing Quad Stretch',
    durationSeconds: 30,
    instructions: 'Pull foot to glutes, hold ankle, use wall for balance',
    tip: 'Feel stretch in front of thigh',
    videoUrl: 'https://www.youtube.com/embed/IwB89iBDLbM',
    placements: [{ routineSlug: 'legs', orderIndex: 0 }],
  },
  {
    slug: 'standing-hamstring-stretch',
    name: 'Standing Hamstring Stretch',
    durationSeconds: 30,
    instructions: 'Place heel on bench, lean forward slightly',
    tip: 'Keep leg straight, feel stretch in back of thigh',
    videoUrl: 'https://www.youtube.com/embed/qQ26F282VRo',
    placements: [{ routineSlug: 'legs', orderIndex: 1 }],
  },
  {
    slug: 'hip-flexor-stretch',
    name: 'Hip Flexor Stretch',
    durationSeconds: 30,
    instructions: 'Lunge position, push hips forward',
    tip: 'Feel stretch in front of hip',
    videoUrl: 'https://www.youtube.com/embed/ktgtEWGhFd8',
    placements: [{ routineSlug: 'legs', orderIndex: 2 }],
  },
  {
    slug: 'calf-stretch',
    name: 'Calf Stretch',
    durationSeconds: 30,
    instructions: 'Step back, press heel down, lean forward',
    tip: 'Keep back leg straight',
    videoUrl: 'https://www.youtube.com/embed/mafo7o7OnFo',
    placements: [{ routineSlug: 'legs', orderIndex: 3 }],
  },
  {
    slug: 'pigeon-pose',
    name: 'Pigeon Pose',
    durationSeconds: 45,
    instructions: 'Bring one leg forward bent, extend other leg back',
    tip: 'Breathe deeply, feel hip stretch',
    videoUrl: 'https://www.youtube.com/embed/1o7awuDGzag',
    placements: [{ routineSlug: 'legs', orderIndex: 4 }],
  },
  {
    slug: 'lat-stretch',
    name: 'Lat Stretch',
    durationSeconds: 30,
    instructions: 'Reach one arm overhead and lean to opposite side',
    tip: 'Feel stretch along side of back and armpit area',
    videoUrl: 'https://www.youtube.com/embed/x97hAScVHHc',
    placements: [{ routineSlug: 'pull', orderIndex: 0 }],
  },
  {
    slug: 'bicep-wall-stretch',
    name: 'Bicep Wall Stretch',
    durationSeconds: 30,
    instructions: 'Place palm on wall behind you, step forward gently',
    tip: "Don't force it - gentle stretch in front of arm",
    videoUrl: 'https://www.youtube.com/embed/j0rdJpN4B8Y',
    placements: [{ routineSlug: 'pull', orderIndex: 1 }],
  },
  {
    slug: 'upper-trap-stretch',
    name: 'Upper Trap Stretch',
    durationSeconds: 30,
    instructions: 'Tilt head to side, pull gently with opposite hand',
    tip: 'Feel stretch in neck and upper shoulder area',
    videoUrl: 'https://www.youtube.com/embed/dWICLaovAVc',
    placements: [{ routineSlug: 'pull', orderIndex: 2 }],
  },
];

export async function seedStretches(connectionString = process.env.MIGRATION_DATABASE_URL): Promise<void> {
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL is required to seed system content');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');

    const routineIds = new Map<string, string>();
    for (const routine of routineDaySeedRows) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO routine_days (slug, name, description, owner_user_id)
         VALUES ($1, $2, NULL, NULL)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description
           WHERE routine_days.owner_user_id IS NULL
         RETURNING id`,
        [routine.slug, routine.name],
      );

      if (result.rows.length !== 1) {
        throw new Error(`Cannot seed system routine day ${routine.slug}: slug is owned by another user`);
      }
      routineIds.set(routine.slug, result.rows[0]!.id);
    }

    const exerciseIds = new Map<string, string>();
    for (const stretch of stretchSeedRows) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO exercises (
           slug, name, muscle_groups, equipment, form_tips, beginner_notes,
           video_url, alternatives, kind, duration_seconds, owner_user_id
         )
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'stretch', $8, NULL)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               muscle_groups = EXCLUDED.muscle_groups,
               equipment = EXCLUDED.equipment,
               form_tips = EXCLUDED.form_tips,
               beginner_notes = EXCLUDED.beginner_notes,
               video_url = EXCLUDED.video_url,
               alternatives = EXCLUDED.alternatives,
               kind = EXCLUDED.kind,
               duration_seconds = EXCLUDED.duration_seconds
           WHERE exercises.owner_user_id IS NULL
         RETURNING id`,
        [
          stretch.slug,
          stretch.name,
          [],
          stretch.instructions,
          stretch.tip,
          stretch.videoUrl,
          [],
          stretch.durationSeconds,
        ],
      );

      if (result.rows.length !== 1) {
        throw new Error(`Cannot seed system stretch ${stretch.slug}: slug is owned by another user`);
      }
      exerciseIds.set(stretch.slug, result.rows[0]!.id);
    }

    const expectedPlacementsByExerciseId = new Map<string, Set<string>>();
    for (const stretch of stretchSeedRows) {
      const exerciseId = exerciseIds.get(stretch.slug);
      if (!exerciseId) {
        throw new Error(`Missing seed key for ${stretch.slug}`);
      }

      const expectedKeys = new Set<string>();
      for (const placement of stretch.placements) {
        const routineDayId = routineIds.get(placement.routineSlug);
        if (!routineDayId) {
          throw new Error(`Missing routine day ${placement.routineSlug} for ${stretch.slug}`);
        }
        expectedKeys.add(`${routineDayId}:stretch:${placement.orderIndex}`);
      }
      expectedPlacementsByExerciseId.set(exerciseId, expectedKeys);
    }

    const existingCanonicalAssociations = await client.query<{
      id: string;
      exercise_id: string;
      routine_day_id: string;
      phase: 'main_workout' | 'stretch';
      order_index: number;
    }>(
      `SELECT id, exercise_id, routine_day_id, phase, order_index
       FROM routine_exercises
       WHERE exercise_id = ANY($1::uuid[])`,
      [[...expectedPlacementsByExerciseId.keys()]],
    );
    const staleAssociationIds = existingCanonicalAssociations.rows
      .filter((association) => {
        const expectedKeys = expectedPlacementsByExerciseId.get(association.exercise_id);
        return expectedKeys !== undefined && !expectedKeys.has(
          `${association.routine_day_id}:${association.phase}:${association.order_index}`,
        );
      })
      .map((association) => association.id);

    if (staleAssociationIds.length > 0) {
      await client.query(
        `DELETE FROM routine_exercises WHERE id = ANY($1::uuid[])`,
        [staleAssociationIds],
      );
    }

    for (const stretch of stretchSeedRows) {
      const exerciseId = exerciseIds.get(stretch.slug);
      if (!exerciseId) {
        throw new Error(`Missing seed key for ${stretch.slug}`);
      }

      for (const placement of stretch.placements) {
        const routineDayId = routineIds.get(placement.routineSlug);
        if (!routineDayId) {
          throw new Error(`Missing routine day ${placement.routineSlug} for ${stretch.slug}`);
        }

        const associationResult = await client.query<{ id: string }>(
          `INSERT INTO routine_exercises (
             routine_day_id, exercise_id, phase, order_index, target_sets, target_reps,
             target_reps_range, rest_time
           )
           VALUES ($1, $2, 'stretch', $3, NULL, NULL, NULL, NULL)
           ON CONFLICT (routine_day_id, phase, order_index) DO UPDATE
             SET exercise_id = EXCLUDED.exercise_id,
                 target_sets = EXCLUDED.target_sets,
                 target_reps = EXCLUDED.target_reps,
                 target_reps_range = EXCLUDED.target_reps_range,
                 rest_time = EXCLUDED.rest_time
             WHERE routine_exercises.exercise_id = EXCLUDED.exercise_id
           RETURNING id`,
          [routineDayId, exerciseId, placement.orderIndex],
        );
        if (associationResult.rows.length !== 1) {
          throw new Error(`Cannot seed stretch placement ${stretch.slug}: slot is occupied by other system content`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  seedStretches()
    .then(() => {
      const placements = stretchSeedRows.reduce((count, stretch) => count + stretch.placements.length, 0);
      console.log(`Seeded ${stretchSeedRows.length} stretches across ${placements} routine-day placements.`);
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
