import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

/**
 * Row-level seeding for the history and progress specs (M3-08, #65).
 *
 * These two screens are read-only projections of data that takes dozens of UI interactions to
 * produce honestly: a 21-session cursor walk would be 21 workouts clicked through in a browser, and
 * the pagination logic would still only be tested on one device's worth of history. So the rows are
 * written with the same SQL the M2-06 progress integration test writes
 * (`tests/integration/api/progress.test.ts:seedLoggedSets`), and the *reading* — which is the entire
 * subject of this slice — happens through the real pages.
 *
 * What this does not do is fake the app's own write path to make a test cheaper. Every mutation
 * still goes through the sync engine and the runner in `session-runner.spec.ts`; this file exists
 * for the histories no single athlete could click into existence inside a test budget.
 */

/**
 * The **owner** role, not the app's.
 *
 * `DATABASE_URL` is the authenticated PostgREST/Supabase role, and every table here is behind RLS
 * keyed on `auth.uid()`. A plain `Client` on that connection has no JWT claim to compare against,
 * so an insert fails with `new row violates row-level security policy` — which is the policy doing
 * its job, not a bug to route around. `MIGRATION_DATABASE_URL` is the same connection the API
 * fixtures use for the same purpose (`tests/integration/api/fixtures.ts:26`).
 */
export async function openHistoryDb(): Promise<Client> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL must be set to seed history rows (see .env.local).');
  }
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/**
 * `workout_sessions.user_id` is a foreign key onto `profiles`, and a user created through the
 * GoTrue admin API has an auth row but no profile — the app only writes one when the athlete
 * touches their preferences. Seeding therefore has to create it, exactly as the API fixtures do.
 */
export async function ensureProfile(client: Client, userId: string): Promise<void> {
  await client.query(
    `INSERT INTO profiles (id, email) VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [userId, `e2e-history-${userId}@example.com`],
  );
}

export interface SeedSet {
  /** `null` is the M2-05 importer's shape: a set that exists with no load recorded. */
  weightKg?: number | null;
  reps?: number | null;
  exerciseSlug?: string;
}

export interface SeedSession {
  userId: string;
  localDate: string;
  status?: 'in_progress' | 'completed' | 'archived';
  phase?: 'pre_workout' | 'exercise' | 'rest' | 'stretch' | 'post_workout';
  source?: 'app' | 'legacy_import';
  completedAt?: string | null;
  routineDaySlug?: string;
  sets?: SeedSet[];
}

/**
 * Insert one session with its sets, returning its id.
 *
 * `server_seq` starts at 0 and is left alone: these rows are read by screens that never compare
 * sequences, and inventing a sequence here would be fabricating a position in a change stream that
 * does not contain them.
 */
export async function seedSession(client: Client, input: SeedSession): Promise<string> {
  await ensureProfile(client, input.userId);
  const status = input.status ?? 'archived';
  const phase = input.phase ?? 'post_workout';
  const source = input.source ?? 'app';
  const startedAt = `${input.localDate}T12:00:00.000Z`;
  const completedAt =
    input.completedAt === undefined
      ? status === 'in_progress'
        ? null
        : `${input.localDate}T12:52:00.000Z`
      : input.completedAt;

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO workout_sessions
       (user_id, routine_day_id, client_id, local_date, status, phase, source, server_seq,
        started_at, completed_at)
     VALUES ($1, (SELECT id FROM routine_days WHERE slug = $7 AND owner_user_id IS NULL),
             $2, $3, $4, $5, $6, 0, $8, $9)
     RETURNING id`,
    [
      input.userId,
      randomUUID(),
      input.localDate,
      status,
      phase,
      source,
      input.routineDaySlug ?? 'push',
      startedAt,
      completedAt,
    ],
  );

  const sessionId = inserted.rows[0]!.id;
  const sets = input.sets ?? [];

  for (const [index, set] of sets.entries()) {
    await client.query(
      `INSERT INTO session_sets
         (user_id, session_id, exercise_id, set_index, is_completed, weight_kg, reps, client_ts,
          updated_at)
       VALUES ($1, $2, (SELECT id FROM exercises WHERE slug = $3), $4, true, $5, $6, $7, $7)`,
      [
        input.userId,
        sessionId,
        set.exerciseSlug ?? 'bench-press',
        index,
        set.weightKg ?? null,
        set.reps ?? null,
        `${input.localDate}T12:0${index}:00.000Z`,
      ],
    );
  }

  return sessionId;
}

export async function seedPersonalRecord(
  client: Client,
  input: { userId: string; exerciseSlug: string; bestE1rm: number; achievedAt: string; sessionId?: string },
): Promise<void> {
  await client.query(
    `INSERT INTO personal_records (user_id, exercise_id, best_e1rm, achieved_at, session_id, updated_at)
     VALUES ($1, (SELECT id FROM exercises WHERE slug = $2), $3, $4, $5, now())
     ON CONFLICT (user_id, exercise_id) DO UPDATE SET best_e1rm = EXCLUDED.best_e1rm`,
    [input.userId, input.exerciseSlug, input.bestE1rm, input.achievedAt, input.sessionId ?? null],
  );
}

/**
 * One exercise owned by one user, with a slug nobody else could guess.
 *
 * `exercises.slug` is globally unique, so a second user's custom exercise cannot reuse a system
 * slug — which is also why the disclosure test needs its own row: the private name has to be
 * something the assertion can look for and fail on.
 */
export async function seedOwnedExercise(
  client: Client,
  input: { ownerUserId: string; name: string },
): Promise<string> {
  await ensureProfile(client, input.ownerUserId);
  const slug = `private-${randomUUID().slice(0, 8)}`;
  await client.query(
    `INSERT INTO exercises (slug, name, muscle_groups, kind, owner_user_id)
     VALUES ($1, $2, '{}', 'strength', $3)`,
    [slug, input.name, input.ownerUserId],
  );
  return slug;
}
