import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { seedExercises } from '../../../db/seed/exercises.js';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { LegacyImportResponseSchema, type ImportReport } from '../../../lib/contracts/import.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import {
  apiRequest,
  jsonRequest,
  responseBody,
  startApiServer,
  stopApiServer,
} from './test-server.js';

/**
 * M2-05 (#40): the acceptance harness for `POST /api/import/legacy`, run for real
 * since the handler landed.
 *
 * The assertions that matter here are the ones a response body cannot fake. A
 * report claiming three sessions is worthless if the rows are absent, if a retry
 * adds three more, or if the counts describe the request rather than the
 * database — so the replay spec counts rows directly, through the owner
 * connection, instead of re-reading the report's own arithmetic.
 *
 * Seeding is a precondition, not a convenience: the importer maps legacy
 * `ex1`…`ex6` onto exercises in the seeded system days, so with no seeds it has
 * nowhere to file an imported session and reports the batch as unwritable. CI
 * runs this suite without a seed step, which is why `beforeAll` calls
 * `seedExercises` itself rather than relying on some other file having done it.
 *
 * Request budget: the limiter allows five per user per hour, so the specs below
 * spend exactly four before the rate-limit spec proves the fifth and sixth.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

/** Realistic legacy values, including the `""` key a browser actually writes. */
const legacyPayload = {
  pushWorkoutProgress: JSON.stringify({
    currentPhase: 'main-workout',
    state: {
      mainWorkoutSets: { 'ex1-set1': true, 'ex1-set2': false, 'ex6-set2': true },
      warmupExercises: { 'cardio-done': true },
    },
    timestamp: Date.parse('2026-08-01T09:00:00.000Z'),
  }),
  legsWorkoutProgress: JSON.stringify({
    currentPhase: 'main-workout',
    state: { mainWorkoutSets: { 'ex2-set1': true } },
    checkboxStates: { 'ex2-set1': true, 'ex2-set2': false },
    timerStates: { cardio: { seconds: 120, isRunning: false } },
  }),
  pullDayProgress: JSON.stringify({
    currentPhase: 'workout',
    completedSets: 5,
    completedExercises: 2,
    workoutStartTime: Date.parse('2026-07-15T18:00:00.000Z'),
    cardioTimeLeft: 300,
    cooldownTimeLeft: 600,
    checkboxStates: { '': true, meal: true },
    stretchStates: { '0': true },
  }),
};

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

async function reportOf(response: Response): Promise<ImportReport> {
  const body = await responseBody(response);
  const parsed = LegacyImportResponseSchema.safeParse(body);
  expect(parsed.success, `unexpected import response shape: ${JSON.stringify(body)}`).toBe(true);
  if (!parsed.success || !parsed.data.ok) {
    throw new Error('Import response did not match its contract.');
  }
  return parsed.data.data.report;
}

/** `warnings` is optional in the contract, so the specs read it through one narrowing helper. */
function warningText(report: ImportReport): string {
  return report.warnings?.join('\n') ?? '';
}

async function importRows(owner: TestSession): Promise<{ sessions: number; sets: number }> {
  if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required to count imported rows.');
  const client = new Client({ connectionString: OWNER_URL });
  await client.connect();
  try {
    const sessions = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM workout_sessions
        WHERE user_id = $1 AND routine_day_id IN (
          SELECT id FROM routine_days WHERE slug IN ('push', 'legs', 'pull'))`,
      [owner.userId],
    );
    const sets = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM session_sets ss
        JOIN workout_sessions s ON s.id = ss.session_id
        WHERE s.user_id = $1 AND s.source = 'legacy_import'`,
      [owner.userId],
    );
    return {
      sessions: Number(sessions.rows[0]?.count ?? -1),
      sets: Number(sets.rows[0]?.count ?? -1),
    };
  } finally {
    await client.end();
  }
}

describe('POST /api/import/legacy (M2-05)', () => {
  let owner!: TestSession;

  beforeAll(async () => {
    await startApiServer();
    await seedExercises(OWNER_URL);
    owner = await createTestSession('legacy-import');
  });

  afterAll(async () => {
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('imports all three divergent key shapes and reports what it recovered', async () => {
    const response = await jsonRequest('/api/import/legacy', legacyPayload, {
      method: 'POST',
      headers: authHeaders(owner),
    });

    expect(response.status).toBe(200);
    const report = await reportOf(response);
    // push (2 checked sets) + legs (1 set) + pull (counts only, no set rows).
    expect(report.sessionsCreated).toBe(3);
    expect(report.setsRecovered).toBe(3);
    // Low, even though push and pull both carry real timestamps: legs day stored
    // no date of any kind, so the batch cannot tell the user to trust all three
    // dates on the strength of two.
    expect(report.dateConfidence).toBe('low');
    expect(report.fieldsNotRecovered.join('\n')).toMatch(/legs day: the legacy app stored no workout date/);

    const fields = report.fieldsNotRecovered.join('\n');
    expect(fields).toMatch(/weight, reps, RPE/);
    expect(fields).toMatch(/userStats|per-set completion/);
    expect(warningText(report)).toMatch(/aggregate counts only/);
    // The collapsed pull key is a loss the user has to be told about, not a
    // validation error that hides the rest of their history.
    expect(warningText(report)).toMatch(/""/);

    expect(await importRows(owner)).toEqual({ sessions: 3, sets: 3 });
  });

  it('keeps valid keys importable when a sibling key is malformed', async () => {
    const response = await jsonRequest('/api/import/legacy', {
      pushWorkoutProgress: legacyPayload.pushWorkoutProgress,
      legsWorkoutProgress: '{malformed-json',
    }, { method: 'POST', headers: authHeaders(owner) });

    expect(response.status).toBe(200);
    const report = await reportOf(response);
    expect(report.sessionsCreated).toBe(1);
    expect(warningText(report)).toMatch(/legsWorkoutProgress: skipped/);

    const before = await importRows(owner);
    const replay = await jsonRequest('/api/import/legacy', {
      pushWorkoutProgress: legacyPayload.pushWorkoutProgress,
      legsWorkoutProgress: '{malformed-json',
    }, { method: 'POST', headers: authHeaders(owner) });
    expect(warningText(await reportOf(replay))).toMatch(/legsWorkoutProgress: skipped/);
    // Replaying a batch whose sibling was skipped must not quietly import it twice.
    expect(await importRows(owner)).toEqual(before);
  });

  it('returns the original report for an identical source fingerprint', async () => {
    const first = await jsonRequest('/api/import/legacy', legacyPayload, {
      method: 'POST',
      headers: authHeaders(owner),
    });
    const rowsBefore = await importRows(owner);

    const second = await jsonRequest('/api/import/legacy', legacyPayload, {
      method: 'POST',
      headers: authHeaders(owner),
    });

    expect(second.status).toBe(200);
    expect(await reportOf(second)).toEqual(await reportOf(first));
    expect(await importRows(owner)).toEqual(rowsBefore);
  });

  it('rejects unauthenticated imports with the canonical 401 envelope', async () => {
    const response = await apiRequest('/api/import/legacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(legacyPayload),
    });
    await expectAppError(response, 401, 'UNAUTHENTICATED');
  });

  it('enforces the documented five requests per hour per-user limit', async () => {
    // Four of the budget are spent by the specs above; two more requests remain.
    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      lastResponse = await jsonRequest('/api/import/legacy', legacyPayload, {
        method: 'POST',
        headers: authHeaders(owner),
      });
      if (lastResponse.status === 429) break;
    }
    if (!lastResponse) throw new Error('Expected a rate-limit response.');
    await expectAppError(lastResponse, 429, 'RATE_LIMITED');
    expect(lastResponse.headers.get('retry-after')).toMatch(/^\d+$/);
  });
});
