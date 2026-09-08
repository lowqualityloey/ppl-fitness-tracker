import { resolve } from 'node:path';
import { Client } from 'pg';

type SeedExercise = {
  routineSlug: 'push' | 'legs' | 'pull';
  orderIndex: number;
  slug: string;
  name: string;
  muscleGroups: string[];
  equipment: string | null;
  formTips: string;
  beginnerNotes: string | null;
  videoUrl: string | null;
  alternatives: string[];
  targetSets: number;
  targetRepsRange: string;
  restTime: string;
};

type SeedRoutineDay = {
  slug: SeedExercise['routineSlug'];
  name: string;
};

export const routineDaySeedRows: readonly SeedRoutineDay[] = [
  { slug: 'push', name: 'Push Day' },
  { slug: 'legs', name: 'Legs Day' },
  { slug: 'pull', name: 'Pull Day' },
];

/**
 * Source mapping decisions:
 * - Push/legs equipment stays NULL because their HTML only names locations,
 *   not structured equipment.
 * - Pull's numeric restTime values are seconds and are normalized to text
 *   values with an explicit unit; push/legs ranges remain ranges.
 * - targetRepsRange is authoritative. targetReps is only the lower-bound
 *   compatibility projection required by the original integer schema.
 * - beginnerNotes is kept separately from formTips so pull-day guidance is
 *   not silently discarded or merged with a different source field.
 */
export const exerciseSeedRows: readonly SeedExercise[] = [
  {
    routineSlug: 'push',
    orderIndex: 0,
    slug: 'bench-press',
    name: 'Bench Press',
    muscleGroups: ['Chest', 'Shoulders', 'Triceps'],
    equipment: null,
    formTips: "Keep feet flat on floor, controlled movement, don't bounce off chest",
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/WbCEvFA0NJs',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '8-10',
    restTime: '60-90s',
  },
  {
    routineSlug: 'push',
    orderIndex: 1,
    slug: 'dumbbell-overhead-press',
    name: 'Dumbbell Overhead Press',
    muscleGroups: ['Shoulders', 'Triceps'],
    equipment: null,
    formTips: 'Keep core engaged, press straight overhead, control the descent',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/b_r_LW4HEcM',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '8-10',
    restTime: '60-90s',
  },
  {
    routineSlug: 'push',
    orderIndex: 2,
    slug: 'chest-press-machine',
    name: 'Chest Press Machine',
    muscleGroups: ['Chest', 'Shoulders'],
    equipment: null,
    formTips: 'Adjust seat height so handles align with mid-chest',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/Qu7-ceCvq7w',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '10-12',
    restTime: '60-90s',
  },
  {
    routineSlug: 'push',
    orderIndex: 3,
    slug: 'lateral-raises',
    name: 'Lateral Raises',
    muscleGroups: ['Shoulders (Side Delts)'],
    equipment: null,
    formTips: 'Lift to shoulder height, slight bend in elbows, control down',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/U2gMn8GXr2A',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '12-15',
    restTime: '60-90s',
  },
  {
    routineSlug: 'push',
    orderIndex: 4,
    slug: 'cable-tricep-pushdowns',
    name: 'Cable Tricep Pushdowns',
    muscleGroups: ['Triceps'],
    equipment: null,
    formTips: 'Keep elbows close to body, only forearms move, squeeze at bottom',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/Rc7-euA8FDI',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '10-12',
    restTime: '60-90s',
  },
  {
    routineSlug: 'push',
    orderIndex: 5,
    slug: 'push-ups',
    name: 'Push-ups',
    muscleGroups: ['Chest', 'Shoulders', 'Triceps'],
    equipment: null,
    formTips: 'Straight line from head to heels, full range of motion',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/4Bc1tPaYkOo',
    alternatives: [],
    targetSets: 2,
    targetRepsRange: '8-12',
    restTime: '60-90s',
  },
  {
    routineSlug: 'legs',
    orderIndex: 0,
    slug: 'goblet-squats',
    name: 'Goblet Squats',
    muscleGroups: ['Quads', 'Glutes', 'Core'],
    equipment: null,
    formTips: 'Hold dumbbell at chest, feet shoulder-width, squat deep, keep chest up',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/lRYBbchqxtI',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '8-10',
    restTime: '60-90s',
  },
  {
    routineSlug: 'legs',
    orderIndex: 1,
    slug: 'leg-press',
    name: 'Leg Press',
    muscleGroups: ['Quads', 'Glutes'],
    equipment: null,
    formTips: 'Feet shoulder-width on platform, lower until knees at 90 degrees',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/BnacvXdaxq8',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '8-10',
    restTime: '60-90s',
  },
  {
    routineSlug: 'legs',
    orderIndex: 2,
    slug: 'romanian-deadlifts',
    name: 'Romanian Deadlifts',
    muscleGroups: ['Hamstrings', 'Glutes'],
    equipment: null,
    formTips: 'Hinge at hips, push hips back, keep back straight, feel hamstring stretch',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/oQwnGfZFfzw',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '10-12',
    restTime: '60-90s',
  },
  {
    routineSlug: 'legs',
    orderIndex: 3,
    slug: 'leg-curls',
    name: 'Leg Curls',
    muscleGroups: ['Hamstrings'],
    equipment: null,
    formTips: 'Lie face down, curl heels toward glutes, control the descent',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/_lgE0gPvbik',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '12-15',
    restTime: '60-90s',
  },
  {
    routineSlug: 'legs',
    orderIndex: 4,
    slug: 'leg-extensions',
    name: 'Leg Extensions',
    muscleGroups: ['Quadriceps'],
    equipment: null,
    formTips: 'Sit back in seat, extend legs fully, squeeze quads at top',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/d3d2yz7V26c',
    alternatives: [],
    targetSets: 3,
    targetRepsRange: '10-12',
    restTime: '60-90s',
  },
  {
    routineSlug: 'legs',
    orderIndex: 5,
    slug: 'calf-raises',
    name: 'Calf Raises',
    muscleGroups: ['Calves'],
    equipment: null,
    formTips: 'Rise up on toes, hold at top, control the descent',
    beginnerNotes: null,
    videoUrl: 'https://www.youtube.com/embed/a-x_NR-ibos?si=dQkkWk5zJvxdqz9Z',
    alternatives: [],
    targetSets: 2,
    targetRepsRange: '12-15',
    restTime: '60s',
  },
  {
    routineSlug: 'pull',
    orderIndex: 0,
    slug: 'lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroups: ['Lats', 'Rhomboids', 'Biceps'],
    equipment: 'Cable Machine with Lat Bar',
    formTips: 'Pull bar to upper chest, squeeze shoulder blades together, lean back slightly',
    beginnerNotes: 'Start light, focus on pulling with your back muscles, not just arms',
    videoUrl: 'https://www.youtube.com/embed/bNmvKpJSWKM',
    alternatives: ['Pull-ups (if you can do them)', 'Assisted Pull-up Machine', 'Resistance Band Pulldowns'],
    targetSets: 3,
    targetRepsRange: '8-10',
    restTime: '90s',
  },
  {
    routineSlug: 'pull',
    orderIndex: 1,
    slug: 'seated-cable-row',
    name: 'Seated Cable Row',
    muscleGroups: ['Lats', 'Rhomboids', 'Middle Traps'],
    equipment: 'Cable Machine with Handle',
    formTips: 'Sit tall, pull handle to lower ribcage, squeeze shoulder blades',
    beginnerNotes: 'Keep torso upright, pull to your stomach area',
    videoUrl: 'https://www.youtube.com/embed/LyZH4UGdDTc',
    alternatives: ['Bent-over Barbell Row', 'T-Bar Row', 'Resistance Band Rows'],
    targetSets: 3,
    targetRepsRange: '8-10',
    restTime: '90s',
  },
  {
    routineSlug: 'pull',
    orderIndex: 2,
    slug: 'single-arm-dumbbell-row',
    name: 'Single-Arm Dumbbell Row',
    muscleGroups: ['Lats', 'Rhomboids', 'Rear Delts'],
    equipment: 'Dumbbell + Bench',
    formTips: 'Support with bench, pull dumbbell to hip, keep back straight',
    beginnerNotes: 'Use bench for support, pull weight to your hip area',
    videoUrl: 'https://www.youtube.com/embed/yHqqGd0tXcw',
    alternatives: ['Two-arm Dumbbell Row', 'Chest-supported Row Machine', 'Landmine Row'],
    targetSets: 3,
    targetRepsRange: '10-12',
    restTime: '75s',
  },
  {
    routineSlug: 'pull',
    orderIndex: 3,
    slug: 'face-pulls',
    name: 'Face Pulls',
    muscleGroups: ['Rear Delts', 'Middle Traps'],
    equipment: 'Cable Machine with Rope',
    formTips: 'Pull rope to face level, spread handles apart, keep elbows high',
    beginnerNotes: 'Use very light weight, focus on squeezing shoulder blades',
    videoUrl: 'https://www.youtube.com/embed/IeOqdw9WI90',
    alternatives: ['Reverse Fly Machine', 'Band Pull-aparts', 'Bent-over Reverse Fly'],
    targetSets: 3,
    targetRepsRange: '12-15',
    restTime: '60s',
  },
  {
    routineSlug: 'pull',
    orderIndex: 4,
    slug: 'bicep-curls',
    name: 'Bicep Curls',
    muscleGroups: ['Biceps'],
    equipment: 'Dumbbells',
    formTips: 'Keep elbows at sides, curl up smoothly, control the descent',
    beginnerNotes: "Don't swing the weights, focus on controlled movement",
    videoUrl: 'https://www.youtube.com/embed/MKWBV29S6c0',
    alternatives: ['Barbell Curls', 'Cable Bicep Curls', 'Resistance Band Curls'],
    targetSets: 3,
    targetRepsRange: '10-12',
    restTime: '75s',
  },
  {
    routineSlug: 'pull',
    orderIndex: 5,
    slug: 'hammer-curls',
    name: 'Hammer Curls',
    muscleGroups: ['Biceps', 'Forearms'],
    equipment: 'Dumbbells',
    formTips: 'Neutral grip (thumbs up), controlled movement up and down',
    beginnerNotes: 'Hold dumbbells like hammers, same controlled motion as regular curls',
    videoUrl: 'https://www.youtube.com/embed/_aoad2yuP5w',
    alternatives: ['Cross-body Hammer Curls', 'Cable Hammer Curls', 'Neutral Grip Pull-ups'],
    targetSets: 2,
    targetRepsRange: '8-12',
    restTime: '60s',
  },
];

function lowerBound(range: string): number {
  const match = /^(\d+)/.exec(range);
  if (!match) {
    throw new Error(`Invalid target rep range: ${range}`);
  }
  return Number(match[1]);
}

export async function seedExercises(connectionString = process.env.MIGRATION_DATABASE_URL): Promise<void> {
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
    for (const exercise of exerciseSeedRows) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO exercises (
           slug, name, muscle_groups, equipment, form_tips, beginner_notes,
           video_url, alternatives, owner_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
         ON CONFLICT (slug) DO UPDATE
           SET name = EXCLUDED.name,
               muscle_groups = EXCLUDED.muscle_groups,
               equipment = EXCLUDED.equipment,
               form_tips = EXCLUDED.form_tips,
               beginner_notes = EXCLUDED.beginner_notes,
               video_url = EXCLUDED.video_url,
               alternatives = EXCLUDED.alternatives
           WHERE exercises.owner_user_id IS NULL
         RETURNING id`,
        [
          exercise.slug,
          exercise.name,
          exercise.muscleGroups,
          exercise.equipment,
          exercise.formTips,
          exercise.beginnerNotes,
          exercise.videoUrl,
          exercise.alternatives,
        ],
      );

      if (result.rows.length !== 1) {
        throw new Error(`Cannot seed system exercise ${exercise.slug}: slug is owned by another user`);
      }
      exerciseIds.set(exercise.slug, result.rows[0]!.id);
    }

    // Reconcile only the 18 canonical exercise IDs. This removes stale
    // placements (including cross-day placements) without deleting unrelated
    // system content that may legitimately be shared across routine days,
    // such as the dual-day stretches planned for M1-10.
    const expectedPlacementByExerciseId = new Map<
      string,
      { routineDayId: string; orderIndex: number }
    >();
    for (const exercise of exerciseSeedRows) {
      const routineDayId = routineIds.get(exercise.routineSlug);
      const exerciseId = exerciseIds.get(exercise.slug);
      if (!routineDayId || !exerciseId) {
        throw new Error(`Missing seed key for ${exercise.routineSlug}/${exercise.slug}`);
      }
      expectedPlacementByExerciseId.set(exerciseId, {
        routineDayId,
        orderIndex: exercise.orderIndex,
      });
    }

    const existingCanonicalAssociations = await client.query<{
      id: string;
      exercise_id: string;
      routine_day_id: string;
      order_index: number;
    }>(
      `SELECT id, exercise_id, routine_day_id, order_index
       FROM routine_exercises
       WHERE exercise_id = ANY($1::uuid[])`,
      [[...expectedPlacementByExerciseId.keys()]],
    );
    const staleAssociationIds = existingCanonicalAssociations.rows
      .filter((association) => {
        const expected = expectedPlacementByExerciseId.get(association.exercise_id);
        return expected !== undefined && (
          association.routine_day_id !== expected.routineDayId ||
          association.order_index !== expected.orderIndex
        );
      })
      .map((association) => association.id);

    if (staleAssociationIds.length > 0) {
      await client.query(
        `DELETE FROM routine_exercises WHERE id = ANY($1::uuid[])`,
        [staleAssociationIds],
      );
    }

    for (const exercise of exerciseSeedRows) {
      const routineDayId = routineIds.get(exercise.routineSlug);
      const exerciseId = exerciseIds.get(exercise.slug);
      if (!routineDayId || !exerciseId) {
        throw new Error(`Missing seed key for ${exercise.routineSlug}/${exercise.slug}`);
      }

      await client.query(
        `INSERT INTO routine_exercises (
           routine_day_id, exercise_id, order_index, target_sets, target_reps,
           target_reps_range, rest_time
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (routine_day_id, order_index) DO UPDATE
           SET exercise_id = EXCLUDED.exercise_id,
               target_sets = EXCLUDED.target_sets,
               target_reps = EXCLUDED.target_reps,
               target_reps_range = EXCLUDED.target_reps_range,
               rest_time = EXCLUDED.rest_time`,
        [
          routineDayId,
          exerciseId,
          exercise.orderIndex,
          exercise.targetSets,
          lowerBound(exercise.targetRepsRange),
          exercise.targetRepsRange,
          exercise.restTime,
        ],
      );
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
  seedExercises()
    .then(() => console.log(`Seeded ${exerciseSeedRows.length} exercises across ${routineDaySeedRows.length} routine days.`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
