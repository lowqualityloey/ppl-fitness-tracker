import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { CookieJar, createClientFromCookieJar } from '../../../lib/supabase/cookie-jar.js';
import {
  describeGoTrueFailure,
  shouldRetryUserDelete,
  userDeleteRetryDelayMs,
} from './gotrue-failure';

/**
 * Every identity one fixture set owns.
 *
 * These used to be five fixed UUIDs at module scope (`session: 22222222-…`), and that is #80:
 * `playwright.config.ts` runs `fullyParallel` with no worker cap, so two spec files — or the two
 * tests inside `sync-latency.spec.ts`, which is what actually broke — share one database **and one
 * row identity**. Worker A mid-measurement, worker B's `cleanup()` deleting the session A is
 * writing: `SessionNotFoundError` → `404 NOT_FOUND`, green in isolation, red in a full run, and the
 * pre-#105 form of this file made it worse than a read collision because `seedSessionFixtures`
 * **started** with `DELETE … WHERE id IN (the fixed ids)`. Setup was destroying a sibling's data by
 * design, not by accident.
 *
 * So ids are minted per call and returned on the fixture (`const { ids } = await seedSession…`).
 * The invariant this exists to hold is stated as a test in
 * `tests/integration/api/fixture-isolation.test.ts` — see also the sweep below and the notes there
 * on what per-run identity gives up.
 */
export interface FixtureIds {
  readonly mutation: string;
  readonly session: string;
  readonly exercise: string;
  readonly device: string;
  readonly routineDay: string;
  readonly foreignSession: string;
  readonly routineExercise: string;
  readonly foreignDevice: string;
  readonly freshDevice: string;
  readonly set: string;
  readonly task: string;
}

/** Marks the two global (owner-less) fixture rows so a crashed run's leftovers are still findable. */
const FIXTURE_SLUG_PREFIX = 'm4-fixture-run';

function mintFixtureIds(): FixtureIds {
  return {
    mutation: randomUUID(),
    session: randomUUID(),
    exercise: randomUUID(),
    device: randomUUID(),
    routineDay: randomUUID(),
    foreignSession: randomUUID(),
    routineExercise: randomUUID(),
    foreignDevice: randomUUID(),
    freshDevice: randomUUID(),
    set: randomUUID(),
    task: randomUUID(),
  };
}

export const clientTs = '2026-09-08T12:00:00.000Z';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;
const TEST_PASSWORD = 'm1-16-route-test-password';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, ms); });

process.env.NEXT_PUBLIC_SUPABASE_URL ??= SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= SUPABASE_ANON_KEY;

/**
 * Fail loudly at collection time if the suite cannot possibly work.
 *
 * Without this, a missing `MIGRATION_DATABASE_URL` throws inside `beforeAll`, and
 * Vitest reports the whole file's tests as **skipped** — 20 skipped tests, exit code
 * driven only by whatever else failed. A misconfigured machine therefore looks like a
 * deliberately-pending suite, which is how `tests/integration/api/` came to be described
 * as "intentionally RED" long after the handlers shipped.
 *
 * A module-scope throw surfaces as a file-level error instead, which cannot be mistaken
 * for a skip.
 *
 * The sibling failure mode, hit for real in this checkout on 2026-09-11, is worse: if the
 * credentials are *present but wrong* — here `.env.local` still carried the
 * `REPLACE_IN_M1-04` placeholder while migration `0001` creates the role with a real
 * literal — the routes return blanket HTTP 500 and the specs fail on status assertions
 * that look exactly like product bugs. `npm run test:api:preflight` distinguishes the two
 * in seconds and never prints the secret.
 */
const REQUIRED_ENV = [
  ['MIGRATION_DATABASE_URL', 'owner role, direct port 54322 — fixture setup and seeds'],
  ['DATABASE_URL', 'app role, through the pooler — what the route handlers connect as'],
] as const;

const missing = REQUIRED_ENV.filter(([name]) => !process.env[name])
  .map(([name, purpose]) => `  - ${name} (${purpose})`);

if (missing.length > 0) {
  throw new Error(
    'API integration suites need a running Supabase stack and its credentials.\n' +
    'Missing:\n' + missing.join('\n') + '\n' +
    'Start the stack and give the test process its env:  npm run db:up && npm run test:api\n' +
    '(the npm scripts pass `--env-file-if-exists=.env.local`; if you invoke vitest or node ' +
    'directly, source .env.local yourself — Vitest does not put non-VITE_ prefixed keys on process.env.)',
  );
}

interface TestSession {
  userId: string;
  cookie: string;
  /**
   * The same jar contents as `cookie`, as pairs. M3-04's E2E specs need to install
   * these into a browser context, where a `Cookie:` header string is not accepted
   * and re-splitting one by hand would put cookie parsing in two places — the jar
   * already knows which names are `sb-…-auth-token.0` and which are chunk 1.
   */
  cookies: ReadonlyArray<{ name: string; value: string }>;
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
    throw new Error(
      describeGoTrueFailure('create', created.status, JSON.stringify(createdBody)),
    );
  }

  const userId = createdBody.id;
  const jar = new CookieJar();
  const client = createClientFromCookieJar(jar);
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`Could not sign in M1-16 test user: ${error.message}`);

  const jarCookies = jar.getAll().map(({ name, value }) => ({ name, value }));

  return {
    userId,
    cookie: jarCookies.map(({ name, value }) => `${name}=${value}`).join('; '),
    cookies: jarCookies,
    cleanup: async () => {
      /*
       * Retried, on exactly one condition, and the reason it is legitimate here and nowhere else:
       * Postgres rolls a deadlock victim back **completely**, so re-issuing the delete cannot double-apply
       * anything — which is not true of a timeout, where the row may already be gone. `fixture-isolation
       * .test.ts` documents that a second clean of a *successful* delete 404s, and this loop cannot cause
       * that: a 404 is not retryable per `shouldRetryUserDelete`, so only an aborted transaction ever
       * comes round again.
       *
       * This is a teardown retry, not a spec retry. `playwright.config.ts`'s comment is the project's
       * standing rule that a red gate stays red, and it still holds: nothing here can turn a failed
       * assertion, a missed budget, or a slow measurement green. The 500 it absorbs is one whose cause is
       * now named in `gotrue-failure.ts`, on a request that carries no expectation at all.
       */
      for (let attempt = 0; ; attempt += 1) {
        const removed = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
          method: 'DELETE',
          headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        });
        if (removed.ok) return;
        // Read the body *before* assuming there is one: a 500 from the proxy layer is often plain text,
        // and `response.json()` on it would replace a useful error with a parse error.
        const detail = await removed.text().catch(() => '<unreadable response body>');
        if (shouldRetryUserDelete(removed.status, detail, attempt)) {
          await sleep(userDeleteRetryDelayMs(attempt));
          continue;
        }
        throw new Error(
          describeGoTrueFailure('cleanup', removed.status, detail) +
            (attempt > 0
              ? ` — gave up after ${attempt + 1} attempts, every one deadlocked`
              : ''),
        );
      }
    },
  };
}

export function authHeaders(session: TestSession): HeadersInit {
  return { Cookie: session.cookie };
}

export interface SessionFixture {
  /**
   * The identities these rows were created under. Minted per call, so a sibling worker cannot
   * delete them, and no two runs agree on them.
   */
  ids: FixtureIds;
  cleanup: () => Promise<void>;
}

/**
 * Seeds only through the owner DSN. Requests under test still use the app DSN,
 * Supabase cookie, and PostgreSQL RLS path.
 */
export async function seedSessionFixtures(owner: TestSession): Promise<SessionFixture> {
  if (!OWNER_URL) {
    throw new Error('MIGRATION_DATABASE_URL is required for API session fixtures.');
  }

  let foreign: TestSession | undefined;
  let database: Client | undefined;
  let cleanupRows: (() => Promise<void>) | undefined;

  /** Minted once per call: this run's rows are unreachable by any other run's deletes. */
  const ids = mintFixtureIds();
  /**
   * Slugs carry the session id's prefix because `exercises.slug` and `routine_days.slug` are both
   * `NOT NULL UNIQUE` (`db/schema/index.ts:74,96`). Per-run UUIDs with fixed slugs would just move
   * the collision from the primary key to the natural key.
   */
  const slugSuffix = ids.session.slice(0, 8);
  const exerciseSlug = `${FIXTURE_SLUG_PREFIX}-${slugSuffix}-exercise`;
  const routineDaySlug = `${FIXTURE_SLUG_PREFIX}-${slugSuffix}-day`;

  try {
    foreign = await createTestSession('sessions-foreign');
    database = new Client({ connectionString: OWNER_URL });
    await database.connect();

    const connectedDatabase = database;
    const connectedForeign = foreign;
    cleanupRows = async (): Promise<void> => {
      await connectedDatabase.query(
        'DELETE FROM personal_records WHERE session_id IN ($1, $2)',
        [ids.session, ids.foreignSession],
      );
      await connectedDatabase.query('DELETE FROM workout_sessions WHERE routine_day_id = $1', [ids.routineDay]);
      await connectedDatabase.query('DELETE FROM routine_exercises WHERE id = $1', [ids.routineExercise]);
      await connectedDatabase.query('DELETE FROM routine_days WHERE id = $1', [ids.routineDay]);
      await connectedDatabase.query('DELETE FROM exercises WHERE id = $1', [ids.exercise]);
    };

    /**
     * What replaces the old `await cleanupRows()` at seed time.
     *
     * The fixed-id version was self-healing: a crashed run left rows behind, and the next run —
     * minting the same ids — deleted them. Per-run ids give that up, so a crashed run's leftovers
     * would now persist forever. Sweeping by id cannot fix that (nothing repeats), so this sweeps by
     * the marker the slugs carry and bounds it by age: 2 hours is longer than the slowest full
     * battery on this machine by an order of magnitude, so it cannot reach a sibling's live rows —
     * which is the whole point of the card. `routine_exercises` goes with its day by cascade
     * (`db/schema/index.ts:118`), and the day's sessions go first because they reference it.
     */
    const sweepStaleFixtureRows = async (): Promise<void> => {
      const stale = `slug LIKE '${FIXTURE_SLUG_PREFIX}-%' AND created_at < now() - interval '2 hours'`;
      await connectedDatabase.query(
        `DELETE FROM workout_sessions WHERE routine_day_id IN (SELECT id FROM routine_days WHERE ${stale})`,
      );
      await connectedDatabase.query(`DELETE FROM routine_days WHERE ${stale}`);
      await connectedDatabase.query(`DELETE FROM exercises WHERE ${stale}`);
    };

    await sweepStaleFixtureRows();
    await connectedDatabase.query(
      `INSERT INTO profiles (id, email)
       VALUES ($1, $2), ($3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        owner.userId,
        `m2-api-owner-${owner.userId}@example.com`,
        connectedForeign.userId,
        `m2-api-foreign-${connectedForeign.userId}@example.com`,
      ],
    );
    await connectedDatabase.query(
      `INSERT INTO exercises (
         id, slug, name, muscle_groups, equipment, form_tips, beginner_notes,
         video_url, alternatives, kind, duration_seconds, owner_user_id
       )
       VALUES ($1, $2, 'API Fixture Press', ARRAY['chest', 'triceps'],
               'barbell', 'Keep the wrists stacked.', 'Use a controlled range of motion.',
               NULL, ARRAY[]::text[], 'strength', NULL, NULL)`,
      [ids.exercise, exerciseSlug],
    );
    await connectedDatabase.query(
      `INSERT INTO routine_days (id, slug, name, description, owner_user_id)
       VALUES ($1, $2, 'API Fixture Push Day', 'Deterministic API test routine.', NULL)`,
      [ids.routineDay, routineDaySlug],
    );
    await connectedDatabase.query(
      `INSERT INTO routine_exercises (
         id, routine_day_id, exercise_id, phase, order_index, target_sets,
         target_reps, target_reps_range, rest_time
       )
       VALUES ($1, $2, $3, 'main_workout', 0, 3, 8, '8-10', '90s')`,
      [ids.routineExercise, ids.routineDay, ids.exercise],
    );
    await connectedDatabase.query(
      `INSERT INTO workout_sessions (
         id, user_id, routine_day_id, client_id, status, phase, source,
         local_date, completed_at, server_seq
       )
       VALUES
         ($1, $2, $3, $4, 'in_progress', 'exercise', 'app', '2026-09-07',
          NULL, 0),
         ($5, $6, $3, $7, 'in_progress', 'exercise', 'app', '2026-09-06',
          NULL, 0)`,
      [
        ids.session,
        owner.userId,
        ids.routineDay,
        ids.device,
        ids.foreignSession,
        connectedForeign.userId,
        ids.foreignDevice,
      ],
    );
    await connectedDatabase.query(
      `INSERT INTO session_sets (
         id, user_id, session_id, exercise_id, set_index, is_completed,
         weight_kg, reps, client_ts
       )
       VALUES ($1, $2, $3, $4, 0, true, 60.5, 8, $5)`,
      [ids.set, owner.userId, ids.session, ids.exercise, clientTs],
    );
    await connectedDatabase.query(
      `INSERT INTO session_tasks (id, session_id, task_key, completed_at, client_ts)
       VALUES ($1, $2, 'main_workout', $3, $3)`,
      [ids.task, ids.session, clientTs],
    );
  } catch (error) {
    await cleanupRows?.().catch(() => undefined);
    if (database && foreign) {
      await database.query('DELETE FROM profiles WHERE id IN ($1, $2)', [owner.userId, foreign.userId])
        .catch(() => undefined);
    }
    await database?.end().catch(() => undefined);
    await foreign?.cleanup().catch(() => undefined);
    throw error;
  }

  if (!database || !foreign || !cleanupRows) {
    throw new Error('Session fixture setup completed without retaining cleanup handles.');
  }

  const connectedDatabase = database;
  const connectedForeign = foreign;
  const connectedCleanupRows = cleanupRows;
  return {
    ids,
    cleanup: async () => {
      const failures: unknown[] = [];
      const attempt = async (operation: () => Promise<unknown>): Promise<void> => {
        try {
          await operation();
        } catch (error) {
          failures.push(error);
        }
      };

      await attempt(connectedCleanupRows);
      await attempt(() => connectedDatabase.query(
        'DELETE FROM profiles WHERE id IN ($1, $2)',
        [owner.userId, connectedForeign.userId],
      ));
      await attempt(() => connectedDatabase.end());
      await attempt(() => connectedForeign.cleanup());

      if (failures.length > 0) {
        throw new AggregateError(failures, 'Could not fully clean up API session fixtures.');
      }
    },
  };
}

export type { TestSession };
