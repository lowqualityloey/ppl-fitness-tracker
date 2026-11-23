import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { createDb, type DbHandle } from '../../../lib/db/client.js';
import type { JwtClaims } from '../../../lib/db/with-user.js';
import { seedExercises } from '../../../db/seed/exercises.js';
import type { LegacyImportRequest } from '../../../lib/contracts/import.js';
import { LegacyImporter } from '../../../lib/domain/import/legacy-import-service.js';
import { LegacyImportNothingWrittenError, type LegacyImportedCounts } from '../../../lib/domain/import/types.js';
import { buildImportReport, planLegacyImport } from '../../../lib/domain/import/legacy-importer.js';
import { LegacyImportRepository } from '../../../lib/repositories/legacy-import-repository.js';
import { requireRow, type CountRow } from '../test-helpers.js';

/**
 * M2-05 persistence layer, against the real database and the real seeded
 * content. The HTTP harness in `tests/integration/api/import-legacy.test.ts`
 * proves the envelope, the auth wall, and the rate limit. This file proves the
 * parts a response cannot show: that rows exist, that their counts match the
 * report, that a replay adds nothing, and that an aborted batch leaves no
 * fingerprint behind.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;
const TEST_PASSWORD = 'm2-legacy-import-test-password';
const IMPORTED_AT = new Date('2026-09-11T12:00:00.000Z');

interface StoredReportRow {
  report: string;
}

interface SessionStateRow {
  status: string;
  phase: string;
  server_seq: number;
}

interface LiveSessionRow extends SessionStateRow {
  id: string;
}

function decodeJwtPayload(token: string): JwtClaims {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('Supabase did not return a JWT payload.');
  return JSON.parse(
    Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  ) as JwtClaims;
}

async function createAuthenticatedUser(label: string): Promise<{ userId: string; claims: JwtClaims }> {
  const email = `${label}-${randomUUID()}@example.com`;
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  const createdBody = await created.json() as { id?: string };
  if (!created.ok || !createdBody.id) {
    throw new Error(`Could not create legacy-import test user (${created.status}).`);
  }

  const signedIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  const signedInBody = await signedIn.json() as { access_token?: string };
  if (!signedIn.ok || !signedInBody.access_token) {
    throw new Error(`Could not sign in legacy-import test user (${signedIn.status}).`);
  }

  return { userId: createdBody.id, claims: decodeJwtPayload(signedInBody.access_token) };
}

function legacyRequest(): LegacyImportRequest {
  return {
    pushWorkoutProgress: JSON.stringify({
      currentPhase: 'main-workout',
      state: {
        mainWorkoutSets: { 'ex1-set1': true, 'ex1-set2': true, 'ex6-set2': true },
        warmupExercises: { 'cardio-done': true },
      },
      timestamp: Date.parse('2026-08-01T09:00:00.000Z'),
    }),
    legsWorkoutProgress: JSON.stringify({
      currentPhase: 'main-workout',
      state: { mainWorkoutSets: { 'ex2-set1': true } },
      checkboxStates: { 'ex2-set1': true, 'ex2-set2': false },
      timerStates: {},
    }),
    pullDayProgress: JSON.stringify({
      currentPhase: 'workout',
      completedSets: 5,
      completedExercises: 2,
      workoutStartTime: Date.parse('2026-07-15T18:00:00.000Z'),
      cardioTimeLeft: 300,
      cooldownTimeLeft: 600,
      // The real collapsed key: all 17 set boxes wrote onto one entry.
      checkboxStates: { '': true, meal: true },
      stretchStates: { '0': true },
    }),
  };
}

async function setRowsByExercise(owner: Client, userId: string) {
  const result = await owner.query<{
    day_slug: string;
    order_index: number;
    exercise_slug: string;
    set_index: number;
    weight_kg: number | null;
    reps: number | null;
    status: string;
    source: string;
    completed_at: Date | null;
  }>(
    `SELECT rd.slug AS day_slug, re.order_index, e.slug AS exercise_slug, ss.set_index,
            ss.weight_kg, ss.reps, s.status, s.source, s.completed_at
       FROM session_sets ss
       JOIN workout_sessions s ON s.id = ss.session_id
       JOIN routine_days rd ON rd.id = s.routine_day_id
       JOIN exercises e ON e.id = ss.exercise_id
       JOIN routine_exercises re ON re.routine_day_id = rd.id AND re.exercise_id = e.id
      WHERE ss.user_id = $1
      ORDER BY rd.slug, re.order_index, ss.set_index`,
    [userId],
  );
  return result.rows;
}

describe('LegacyImportRepository', () => {
  let owner: Client;
  let app: DbHandle;
  let userId: string;
  let claims: JwtClaims;
  let otherUserId: string;
  let otherClaims: JwtClaims;
  let repository: LegacyImportRepository;
  let importer: LegacyImporter;

  beforeAll(async () => {
    if (!OWNER_URL || !APP_URL) {
      throw new Error('MIGRATION_DATABASE_URL and DATABASE_URL are required for legacy-import repository tests.');
    }

    owner = new Client({ connectionString: OWNER_URL });
    await owner.connect();
    app = createDb(APP_URL);

    // The importer resolves legacy exercises through the seeded system content,
    // so the seeds are a precondition of this file rather than something to mock.
    await seedExercises(OWNER_URL);

    ({ userId, claims } = await createAuthenticatedUser('m2-legacy-import'));
    ({ userId: otherUserId, claims: otherClaims } = await createAuthenticatedUser('m2-legacy-import-other'));

    repository = new LegacyImportRepository(app.db, claims);
    importer = new LegacyImporter(repository, () => IMPORTED_AT);
  });

  afterAll(async () => {
    for (const id of [userId, otherUserId]) {
      if (!id) continue;
      await owner.query(
        'DELETE FROM session_sets WHERE user_id = $1',
        [id],
      );
      await owner.query(
        'DELETE FROM workout_sessions WHERE user_id = $1',
        [id],
      );
      await owner.query('DELETE FROM import_batches WHERE user_id = $1', [id]);
    }
    await app.pool.end();
    await owner.end();
  });

  it('writes the archived sessions, their sets, and a matching report', async () => {
    const raw = legacyRequest();
    const result = await importer.import(userId, raw);

    // push (3 sets) + legs (1) + pull (aggregate only, no set rows)
    expect(result.report.sessionsCreated).toBe(3);
    expect(result.report.setsRecovered).toBe(4);
    expect(result.replayed).toBe(false);

    const rows = await setRowsByExercise(owner, userId);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.source === 'legacy_import')).toBe(true);
    expect(rows.every((row) => row.status === 'archived')).toBe(true);

    const pull = rows.filter((row) => row.day_slug === 'pull');
    expect(pull).toHaveLength(0); // aggregates cannot become rows without inventing identity

    const batches = await owner.query<CountRow>(
      'SELECT count(*)::text AS count FROM import_batches WHERE user_id = $1',
      [userId],
    );
    expect(requireRow(batches.rows, 'import batch count after first import').count).toBe('1');
  });

  it('maps legacy exercise slots onto the seeded exercises with no off-by-one', async () => {
    const rows = await setRowsByExercise(owner, userId);
    const push = rows.filter((row) => row.day_slug === 'push');

    // `ex1` is the legacy app's first exercise and `ex6` its sixth; the seed's
    // order_index starts at 0. These two rows are the whole reason the conversion
    // is a single function: a drift of one here silently relabels every set.
    expect(push.find((row) => row.set_index === 0)?.exercise_slug).toBe('bench-press');
    expect(push.find((row) => row.set_index === 1 && row.order_index === 0)?.exercise_slug).toBe('bench-press');
    expect(push.find((row) => row.order_index === 5)?.exercise_slug).toBe('push-ups');
    expect(push.find((row) => row.order_index === 1)).toBeUndefined();
  });

  it('leaves load columns NULL because the legacy app never captured them', async () => {
    const rows = await setRowsByExercise(owner, userId);

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.weight_kg === null)).toBe(true);
    expect(rows.every((row) => row.reps === null)).toBe(true);
    expect(rows.every((row) => row.completed_at === null)).toBe(true);
  });

  it('replays a stored batch without writing a second copy', async () => {
    const fingerprint = planLegacyImport(legacyRequest(), IMPORTED_AT).fingerprint;
    const before = await setRowsByExercise(owner, userId);

    const replay = await importer.import(userId, legacyRequest());

    expect(replay.replayed).toBe(true);
    expect(replay.fingerprint).toBe(fingerprint);
    // The AC is "returns the original report", so compare against the stored
    // bytes rather than recomputing what the response would look like.
    const stored = await owner.query<StoredReportRow>(
      'SELECT report FROM import_batches WHERE user_id = $1 AND source_fingerprint = $2',
      [userId, fingerprint],
    );
    expect(stored.rows).toHaveLength(1);
    expect(replay.report).toEqual(JSON.parse(requireRow(stored.rows, 'stored import report').report) as unknown);
    expect(replay.report.sessionsCreated).toBe(3);
    expect(replay.report.setsRecovered).toBe(4);
    expect(await setRowsByExercise(owner, userId)).toHaveLength(before.length);
  });

  it('keeps an identical payload from another user in a separate batch', async () => {
    const foreignRepository = new LegacyImportRepository(app.db, otherClaims);

    // The fingerprint is content-addressed, so without the user scoping in the
    // unique index and the predicate, a second account could be told "already
    // imported" by a stranger who posted the same localStorage.
    expect(await foreignRepository.findStoredReport(otherUserId, planLegacyImport(legacyRequest(), IMPORTED_AT).fingerprint))
      .toBeNull();

    const result = await new LegacyImporter(foreignRepository, () => IMPORTED_AT).import(otherUserId, legacyRequest());
    expect(result.replayed).toBe(false);

    const rows = await setRowsByExercise(owner, otherUserId);
    expect(rows).toHaveLength(4);
    expect(new Set([userId, otherUserId]).size).toBe(2);
  });

  it('leaves no fingerprint behind when a batch writes nothing', async () => {
    const fingerprint = `f${'0'.repeat(63)}`;

    await expect(
      repository.commitBatch(userId, fingerprint, [], () => ({
        sessionsCreated: 0,
        setsRecovered: 0,
        fieldsNotRecovered: [],
      })),
    ).rejects.toBeInstanceOf(LegacyImportNothingWrittenError);

    const batches = await owner.query<CountRow>(
      'SELECT count(*)::text AS count FROM import_batches WHERE user_id = $1 AND source_fingerprint = $2',
      [userId, fingerprint],
    );
    expect(requireRow(batches.rows, 'import batch count after aborted write').count).toBe('0');
    expect(await repository.findStoredReport(userId, fingerprint)).toBeNull();
  });

  it('rolls the entire batch back when a later write in it fails', async () => {
    const plan = planLegacyImport(legacyRequest(), IMPORTED_AT);
    const poisoned = plan.plans.map((candidate, index) =>
      index === plan.plans.length - 1 ? { ...candidate, clientId: 'not-a-uuid' } : candidate,
    );
    const fingerprint = 'e'.repeat(64);

    const sessionsBefore = await owner.query<CountRow>(
      'SELECT count(*)::text AS count FROM workout_sessions WHERE user_id = $1',
      [userId],
    );

    // The last plan carries a client id Postgres refuses, so push and legs rows
    // are already inserted when the transaction dies. The report callback returns
    // numbers that never existed: if any part of this batch survived, the
    // assertions below would see them.
    await expect(
      repository.commitBatch(userId, fingerprint, poisoned, () => ({
        sessionsCreated: 99,
        setsRecovered: 99,
        fieldsNotRecovered: ['never persisted'],
      })),
    ).rejects.toThrow();

    const sessionsAfter = await owner.query<CountRow>(
      'SELECT count(*)::text AS count FROM workout_sessions WHERE user_id = $1',
      [userId],
    );
    expect(requireRow(sessionsAfter.rows, 'sessions after rollback').count)
      .toBe(requireRow(sessionsBefore.rows, 'sessions before rollback').count);
    expect(await repository.findStoredReport(userId, fingerprint)).toBeNull();
  });

  it('leaves a session the user is working in untouched', async () => {
    // "Preserve raw keys until acknowledged" is the client's job, but the server
    // path has to be provably non-destructive too: importing legacy history must
    // not clear, archive, or bump the sequence of a live session.
    const live = await owner.query<LiveSessionRow>(
      `INSERT INTO workout_sessions (
           user_id, routine_day_id, client_id, local_date, status, phase, source, server_seq, started_at
         )
         VALUES (
           $1,
           (SELECT id FROM routine_days WHERE slug = 'push' AND owner_user_id IS NULL),
           gen_random_uuid(), '2026-09-09', 'in_progress', 'exercise', 'app', 7,
           TIMESTAMPTZ '2026-09-09T12:00:00Z'
         )
         RETURNING id, status, phase, server_seq`,
      [userId],
    );
    const liveRow = requireRow(live.rows, 'live session before import');

    const raw: LegacyImportRequest = {
      pushWorkoutProgress: JSON.stringify({
        currentPhase: 'main-workout',
        state: { mainWorkoutSets: { 'ex4-set1': true } },
        timestamp: Date.parse('2026-08-20T09:00:00.000Z'),
      }),
    };
    await new LegacyImporter(new LegacyImportRepository(app.db, claims), () => IMPORTED_AT)
      .import(userId, raw);

    const after = await owner.query<SessionStateRow>(
      'SELECT status, phase, server_seq FROM workout_sessions WHERE id = $1',
      [liveRow.id],
    );
    expect(requireRow(after.rows, 'live session after import')).toEqual({
      status: liveRow.status,
      phase: liveRow.phase,
      server_seq: liveRow.server_seq,
    });

    await owner.query('DELETE FROM session_sets WHERE session_id = $1', [liveRow.id]);
    await owner.query('DELETE FROM workout_sessions WHERE id = $1', [liveRow.id]);
  });

  it('turns a losing concurrent twin into a replay instead of a duplicate or a failure', async () => {
    const raw: LegacyImportRequest = {
      pushWorkoutProgress: JSON.stringify({
        currentPhase: 'main-workout',
        state: { mainWorkoutSets: { 'ex3-set1': true } },
        timestamp: Date.parse('2026-08-05T09:00:00.000Z'),
      }),
    };
    const plan = planLegacyImport(raw, IMPORTED_AT);
    const buildReport = (counts: LegacyImportedCounts) => buildImportReport(plan, counts);

    // Two transactions *past* the fingerprint lookup, which is the race the
    // derived client id exists to survive: calling the importer twice would let
    // the pre-check answer the question instead of the unique index. A
    // single-session outcome is therefore proven for every interleaving, not
    // timed to one — whichever transaction loses, its insert conflicts and it
    // re-reads the winner's committed report.
    const [first, second] = await Promise.all([
      new LegacyImportRepository(app.db, claims).commitBatch(
        userId,
        plan.fingerprint,
        plan.plans,
        buildReport,
      ),
      new LegacyImportRepository(app.db, claims).commitBatch(
        userId,
        plan.fingerprint,
        plan.plans,
        buildReport,
      ),
    ]);

    const sessions = await owner.query<CountRow>(
      `SELECT count(*)::text AS count FROM workout_sessions
        WHERE user_id = $1 AND source = 'legacy_import' AND local_date = '2026-08-05'`,
      [userId],
    );
    expect(requireRow(sessions.rows, 'legacy import session count').count).toBe('1');
    expect([first.replayed, second.replayed].filter(Boolean)).toHaveLength(1);
    expect(first.report.setsRecovered).toBe(1);
    expect(second.report.setsRecovered).toBe(1);
  });
});
