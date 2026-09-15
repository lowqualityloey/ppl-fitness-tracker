import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { EXPORT_SESSION_CAP, ExportResponseSchema } from '../../../lib/contracts/export.js';
import type { ExportV1 } from '../../../lib/contracts/export.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

/**
 * M4-21 (#110): `GET /api/export/v1`.
 *
 * The card's first AC names the discipline for this file: "every row the
 * repositories can see for that user appears, counts asserted per table (a
 * deliberately-missing-table control is watched red before the assertion is
 * trusted)." Concretely that means per-table *id sets* compared against the
 * seeded ids, not just a length — a mapper that drops `session_tasks` entirely
 * still passes `sessions.length === 3`, and would not pass these. The control
 * was watched red twice during authoring: once with the route absent (every
 * spec here 404s), and once with each collection's mapping individually
 * emptied.
 *
 * Everything else this file refuses to take on faith:
 * - ADR-0005 from the read side: the archive stores kg and *labels* the
 *   preference; a user whose unit is `lbs` exports 60.5, not 133.4.
 * - [ASSUMPTION-m4-003] over the wire: the 201-session user gets 200 sessions,
 *   `truncated: true`, and an honest `oldestExcluded` — not a 500, not silence.
 * - The per-user 5/hour budget (import-class, owner call): six GETs and the
 *   sixth is the canonical 429 with `Retry-After`.
 * - Cross-user containment in the same shape as the sessions suites: a
 *   substring sweep over the raw bytes for the foreign user's ids.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

interface SeededIds {
  readonly sessionId: string;
  readonly inProgressSessionId: string;
  readonly archivedSessionId: string;
  readonly loadSetId: string;
  readonly nullSetId: string;
  readonly taskIds: string[];
  readonly prId: string;
  readonly importId: string;
  readonly exerciseId: string;
  readonly routineDayId: string;
}

function mint(): SeededIds {
  return {
    sessionId: randomUUID(),
    inProgressSessionId: randomUUID(),
    archivedSessionId: randomUUID(),
    loadSetId: randomUUID(),
    nullSetId: randomUUID(),
    taskIds: [randomUUID(), randomUUID()],
    prId: randomUUID(),
    importId: randomUUID(),
    exerciseId: randomUUID(),
    routineDayId: randomUUID(),
  };
}

const localDateOf = (daysBeforeEndOfJul: number): string =>
  new Date(Date.UTC(2026, 6, 31) - daysBeforeEndOfJul * 86_400_000)
    .toISOString()
    .slice(0, 10);

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

function dataOf(parsed: { success: boolean; data?: unknown }): ExportV1 {
  expect(parsed.success, `envelope rejected: ${JSON.stringify(parsed)}`).toBe(true);
  const envelope = parsed.data as { ok: boolean; data?: ExportV1; error?: unknown };
  expect(envelope.ok, `error response where success was expected: ${JSON.stringify(envelope.error)}`).toBe(true);
  return envelope.data!;
}

describe('/api/export/v1', () => {
  let client!: Client;
  let owner!: TestSession;
  let other!: TestSession;
  let orphan!: TestSession;
  let limited!: TestSession;
  let heavy!: TestSession;
  let ids!: SeededIds;
  const foreignExerciseId = randomUUID();
  const foreignSessionId = randomUUID();
  const foreignRoutineDayId = randomUUID();
  const heavyRoutineDayId = randomUUID();

  const get = (session?: TestSession) =>
    apiRequest('/api/export/v1', session ? { headers: authHeaders(session) } : {});

  /** Owner-role seeding, same posture as every other API suite. */
  async function seedArchive(userId: string, mine: SeededIds): Promise<void> {
    const slugSuffix = mine.sessionId.slice(0, 8);
    await client.query(
      `INSERT INTO profiles (id, email, display_name, preferred_unit)
       VALUES ($1, $2, 'Export Owner', 'lbs')
       ON CONFLICT (id) DO UPDATE SET display_name = 'Export Owner', preferred_unit = 'lbs'`,
      [userId, `m4-21-owner-${userId}@example.com`],
    );
    await client.query(
      `INSERT INTO exercises (id, slug, name, muscle_groups, kind, owner_user_id)
       VALUES ($1, $2, 'Export Fixture Press', ARRAY['chest'], 'strength', $3)`,
      [mine.exerciseId, `m4-21-${slugSuffix}-press`, userId],
    );
    await client.query(
      `INSERT INTO routine_days (id, slug, name, owner_user_id)
       VALUES ($1, $2, 'Export Fixture Day', $3)`,
      [mine.routineDayId, `m4-21-${slugSuffix}-day`, userId],
    );
    await client.query(
      `INSERT INTO workout_sessions
         (id, user_id, routine_day_id, client_id, status, phase, source, local_date,
          started_at, completed_at, server_seq)
       VALUES
         ($1, $5, $3, $6,  'completed',   'post_workout', 'app', '2026-07-15',
          '2026-07-15T12:00:00Z', '2026-07-15T12:52:00Z', 4),
         ($2, $5, $3, $7,  'in_progress', 'exercise',     'app', '2026-07-20',
          '2026-07-20T12:00:00Z', NULL, 0),
         ($4, $5, $3, $8,  'archived',    'post_workout', 'legacy_import', '2026-07-10',
          '2026-07-10T12:00:00Z', '2026-07-10T12:30:00Z', 2)`,
      [
        mine.sessionId, mine.inProgressSessionId, mine.routineDayId, mine.archivedSessionId,
        userId, randomUUID(), randomUUID(), randomUUID(),
      ],
    );
    await client.query(
      `INSERT INTO session_sets
         (id, user_id, session_id, exercise_id, set_index, is_completed, weight_kg, reps, client_ts)
       VALUES
         ($1, $4, $2, $3, 0, true, 60.50, 8, '2026-07-15T12:05:00Z'),
         ($5, $4, $2, $3, 1, true, NULL,  NULL, '2026-07-15T12:09:00Z')`,
      [mine.loadSetId, mine.sessionId, mine.exerciseId, userId, mine.nullSetId],
    );
    for (const [index, taskId] of mine.taskIds.entries()) {
      await client.query(
        `INSERT INTO session_tasks (id, session_id, task_key, completed_at, client_ts)
         VALUES ($1, $2, $3, $4, $4)`,
        [taskId, mine.sessionId, index === 0 ? 'warm_up' : 'main_workout', '2026-07-15T12:20:00Z'],
      );
    }
    await client.query(
      `INSERT INTO personal_records (id, user_id, exercise_id, best_e1rm, achieved_at, session_id)
       VALUES ($1, $2, $3, 72.50, '2026-07-15T12:52:00Z', $4)`,
      [mine.prId, userId, mine.exerciseId, mine.sessionId],
    );
    await client.query(
      `INSERT INTO import_batches (id, user_id, source_fingerprint, report)
       VALUES ($1, $2, $3, $4)`,
      [mine.importId, userId, `fp-${slugSuffix}`,
        JSON.stringify({
          sessionsCreated: 2, setsRecovered: 3, fieldsNotRecovered: ['weight', 'reps'],
        })],
    );
  }

  async function deleteArchiveRows(userId: string): Promise<void> {
    await client.query('DELETE FROM import_batches WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM personal_records WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM session_sets WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM session_tasks WHERE session_id IN (SELECT id FROM workout_sessions WHERE user_id = $1)', [userId]);
    await client.query('DELETE FROM workout_sessions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM exercises WHERE owner_user_id = $1', [userId]);
    await client.query('DELETE FROM routine_days WHERE owner_user_id = $1', [userId]);
    await client.query('DELETE FROM profiles WHERE id = $1', [userId]);
  }

  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the export API suite.');
    await startApiServer();
    client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    owner = await createTestSession('export');
    other = await createTestSession('export-other');
    orphan = await createTestSession('export-orphan');
    limited = await createTestSession('export-limited');
    heavy = await createTestSession('export-heavy');
    ids = mint();
    await seedArchive(owner.userId, ids);

    // A second athlete whose every identifier must appear in *zero* bytes of
    // the owner's archive.
    await client.query(
      `INSERT INTO profiles (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [other.userId, `m4-21-other-${other.userId}@example.com`],
    );
    await client.query(
      `INSERT INTO exercises (id, slug, name, muscle_groups, kind, owner_user_id)
       VALUES ($1, $2, 'Foreign Squeeze Press', ARRAY['chest'], 'strength', $3)`,
      [foreignExerciseId, `m4-21-foreign-${foreignExerciseId.slice(0, 8)}`, other.userId],
    );
    await client.query(
      `INSERT INTO routine_days (id, slug, name, owner_user_id)
       VALUES ($1, $2, 'Foreign Day', $3)`,
      [foreignRoutineDayId, `m4-21-foreign-day-${foreignRoutineDayId.slice(0, 8)}`, other.userId],
    );
    await client.query(
      `INSERT INTO workout_sessions (id, user_id, routine_day_id, client_id, status, local_date)
       VALUES ($1, $2, $3, $4, 'completed', '2026-07-18')`,
      [foreignSessionId, other.userId, foreignRoutineDayId, randomUUID()],
    );

    // Orphan posture (same reachable state the profile suite uses): a signed-in
    // user whose profile row is gone.
    await client.query('DELETE FROM profiles WHERE id = $1', [orphan.userId]);

    // 201 completed sessions for the truncation branch, newest first by date.
    await client.query(
      `INSERT INTO profiles (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [heavy.userId, `m4-21-heavy-${heavy.userId}@example.com`],
    );
    await client.query(
      `INSERT INTO routine_days (id, slug, name, owner_user_id)
       VALUES ($1, $2, 'Heavy Day', $3)`,
      [heavyRoutineDayId, `m4-21-heavy-${heavyRoutineDayId.slice(0, 8)}`, heavy.userId],
    );
    await client.query(
      `INSERT INTO workout_sessions
         (id, user_id, routine_day_id, client_id, status, phase, source, local_date,
          started_at, completed_at, server_seq)
       SELECT gen_random_uuid(), $1, $2, gen_random_uuid(), 'completed', 'post_workout',
              'app', '2026-07-31'::date - (i || ' day')::interval,
              '2026-07-31T12:00:00Z'::timestamptz - (i || ' day')::interval,
              '2026-07-31T12:52:00Z'::timestamptz - (i || ' day')::interval, 0
       FROM generate_series(0, $3) AS i`,
      [heavy.userId, heavyRoutineDayId, EXPORT_SESSION_CAP],
    );
  });

  afterAll(async () => {
    if (client) {
      for (const session of [owner, other, heavy]) {
        await deleteArchiveRows(session.userId).catch(() => undefined);
      }
      await client.query('DELETE FROM profiles WHERE id = ANY($1)', [[owner?.userId, other?.userId, heavy?.userId]])
        .catch(() => undefined);
      await client.end();
    }
    for (const session of [owner, other, orphan, limited, heavy]) {
      await session?.cleanup().catch(() => undefined);
    }
    await stopApiServer();
  });

  it('rejects an unauthenticated GET with the canonical 401', async () => {
    await expectAppError(await get(), 401, 'UNAUTHENTICATED');
  });

  it('404s when the signed-in user has no profile row', async () => {
    await expectAppError(await get(orphan), 404, 'NOT_FOUND');
  });

  it('exports every seeded row per table, keyed by id, not just by count', async () => {
    const response = await get(owner);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="ppl-export-v1-\d{8}\.json"$/);

    const body = dataOf(ExportResponseSchema.safeParse(await responseBody(response)));

    expect(body.version).toBe('v1');
    expect(body.user.id).toBe(owner.userId);
    expect(body.user.displayName).toBe('Export Owner');
    expect(body.measurements).toEqual([]);
    expect(body.truncated).toBe(false);
    expect(body.oldestExcluded).toBeNull();

    const sessionIds = body.sessions.map((s) => s.id).sort();
    expect(sessionIds).toEqual([ids.archivedSessionId, ids.inProgressSessionId, ids.sessionId].sort());

    const main = body.sessions.find((s) => s.id === ids.sessionId)!;
    expect(main.status).toBe('completed');
    expect(main.serverSeq).toBe(4);
    expect(main.sets.map((set) => set.id).sort())
      .toEqual([ids.loadSetId, ids.nullSetId].sort());
    expect(main.tasks.map((task) => task.id).sort())
      .toEqual([...ids.taskIds].sort());

    const archived = body.sessions.find((s) => s.id === ids.archivedSessionId)!;
    expect(archived.source).toBe('legacy_import');
    const inProgress = body.sessions.find((s) => s.id === ids.inProgressSessionId)!;
    expect(inProgress.completedAt).toBeNull();

    expect(body.personalRecords.map((pr) => pr.id)).toEqual([ids.prId]);
    expect(body.imports.map((batch) => batch.id)).toEqual([ids.importId]);
    expect(body.imports[0]!.report).toEqual({
      sessionsCreated: 2, setsRecovered: 3, fieldsNotRecovered: ['weight', 'reps'],
    });
  });

  it('ships kg-canonical numbers with the unit as a label (ADR-0005)', async () => {
    const response = ExportResponseSchema.safeParse(await responseBody(await get(owner)));
    const body = dataOf(response);
    // The seeded set is 60.5 kg in the column while the profile says lbs: a
    // converted export would say 133.4 here, which is a different workout.
    expect(body.user.preferredUnit).toBe('lbs');
    const main = body.sessions.find((s) => s.id === ids.sessionId)!;
    expect(main.sets.find((set) => set.id === ids.loadSetId)!.weightKg).toBe(60.5);
    // And the NULL from the legacy importer survives as null, not laundered to 0.
    expect(main.sets.find((set) => set.id === ids.nullSetId)!.weightKg).toBeNull();
    expect(body.personalRecords[0]!.bestE1rm).toBe(72.5);
  });

  it('contains zero bytes of another athlete\'s archive', async () => {
    const raw = await (await get(owner)).text();
    for (const foreign of [
      other.userId, foreignSessionId, foreignExerciseId, foreignRoutineDayId,
    ]) {
      expect(raw, `foreign id ${foreign} leaked into the owner's export`).not.toContain(foreign);
    }
    // The foreign user's own export sees exactly their own row — the same
    // isolation shape as the sessions suites, run from the other side.
    const theirs = dataOf(ExportResponseSchema.safeParse(await responseBody(await get(other))));
    expect(theirs.sessions.map((s) => s.id)).toEqual([foreignSessionId]);
    expect(theirs.personalRecords).toEqual([]);
  });

  it('truncates honestly above the cap over the wire (ASSUMPTION-m4-003)', async () => {
    const body = dataOf(ExportResponseSchema.safeParse(await responseBody(await get(heavy))));
    expect(body.sessions).toHaveLength(EXPORT_SESSION_CAP);
    expect(body.truncated).toBe(true);
    // newest-first slice of 2026-07-31 .. -200 days: the 201st day is excluded.
    expect(body.sessions[0]!.localDate).toBe(localDateOf(0));
    expect(body.sessions[EXPORT_SESSION_CAP - 1]!.localDate).toBe(localDateOf(EXPORT_SESSION_CAP - 1));
    expect(body.oldestExcluded).toBe(localDateOf(EXPORT_SESSION_CAP));
  });

  it('throttles the sixth request per user with the canonical 429', async () => {
    // Budget is five per hour per user (owner call, import-class); this spec
    // is the only caller on `limited`'s key, so exactly six GETs are made.
    for (let i = 1; i <= 5; i += 1) {
      const allowed = await get(limited);
      expect(allowed.status, `request ${i} of a 5/hour budget`).toBe(200);
      await allowed.text();
    }
    const sixth = await get(limited);
    await expectAppError(sixth, 429, 'RATE_LIMITED');
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
