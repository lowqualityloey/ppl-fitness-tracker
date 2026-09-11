import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import {
  SessionDetailResponseSchema,
  SessionNotModifiedResponseSchema,
} from '../../../lib/contracts/sessions.js';
import { authHeaders, createTestSession, type TestSession } from './fixtures.js';
import { apiRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

/**
 * M3-01 (#58): `GET /api/sessions/:id?since=<serverSeq>` — real deltas.
 *
 * Before this suite, `since` was parsed and thrown away behind a comment
 * claiming deltas shipped. The controls here are the ones the M3-05 poller
 * will rest on, so each proves a different way that comment could still be
 * true in spirit but broken in fact:
 *
 * 1. **Equality is the only "no change" answer**, and its response is small —
 *    the byte budget is *measured* both ways, not asserted from optimism,
 *    because "polls are cheap" (RFC §8.3) is otherwise just marketing.
 * 2. **Above and below are both full state.** A client from the future gets
 *    corrected with data; there is no response shape for "you are wrong".
 * 3. **The short-circuit is user-scoped.** `?since=<n>` against someone
 *    else's session must 404 — answering `{notModified, serverSeq: n}` there
 *    would confirm a stranger's version token, the exact thing the seq-read
 *    before `findSession` could quietly introduce.
 * 4. Per-user responses — including the 404s — are `no-store`.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

const SERVER_SEQ = 7;
const ids = {
  exercise: randomUUID(),
  routineDay: randomUUID(),
  routineExercise: randomUUID(),
  session: randomUUID(),
  foreignSession: randomUUID(),
  set: randomUUID(),
};

async function expectAppError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
  expect(parsed.success).toBe(true);
  if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe(code);
}

describe('GET /api/sessions/:id?since= — real deltas', () => {
  let owner!: TestSession;
  let foreign!: TestSession;
  let client!: Client;

  const get = (query: string, session: TestSession) =>
    apiRequest(`/api/sessions/${ids.session}${query}`, { headers: authHeaders(session) });

  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the session-delta API suite.');
    await startApiServer();
    client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    owner = await createTestSession('deltas');
    foreign = await createTestSession('deltas-foreign');

    await client.query(
      `INSERT INTO exercises (id, slug, name, muscle_groups, alternatives, kind, owner_user_id)
       VALUES ($1, $2, 'Delta Fixture Press', ARRAY['chest'], ARRAY[]::text[], 'strength', NULL)`,
      [ids.exercise, `m3-deltas-${ids.exercise.slice(0, 8)}`],
    );
    await client.query(
      `INSERT INTO routine_days (id, slug, name, owner_user_id)
       VALUES ($1, $2, 'M3 Delta Day', NULL)`,
      [ids.routineDay, `m3-deltas-${ids.routineDay.slice(0, 8)}`],
    );
    await client.query(
      `INSERT INTO routine_exercises (id, routine_day_id, exercise_id, phase, order_index, target_sets, target_reps_range, rest_time)
       VALUES ($1, $2, $3, 'main_workout', 0, 3, '5-8', '90s')`,
      [ids.routineExercise, ids.routineDay, ids.exercise],
    );
    // Owner's session parked at server_seq = 7 with a full set row, so the
    // "changed" answer carries real weight: this is the payload a poll would
    // otherwise keep refetching.
    await client.query(
      `INSERT INTO workout_sessions (id, user_id, routine_day_id, client_id, local_date, status, phase, source, server_seq, started_at)
       VALUES ($1, $2, $3, gen_random_uuid(), '2026-09-08', 'in_progress', 'exercise', 'app', $4, '2026-09-08T12:00:00Z')`,
      [ids.session, owner.userId, ids.routineDay, SERVER_SEQ],
    );
    for (const setIndex of [0, 1, 2]) {
      await client.query(
        `INSERT INTO session_sets (id, user_id, session_id, exercise_id, set_index, is_completed, weight_kg, reps, client_ts)
         VALUES ($1, $2, $3, $4, $5, true, 102.5, 8, now())`,
        [setIndex === 0 ? ids.set : randomUUID(), owner.userId, ids.session, ids.exercise, setIndex],
      );
    }
    await client.query(
      `INSERT INTO session_tasks (id, session_id, task_key, completed_at, client_ts)
       VALUES ($1, $2, 'warm_up', now(), now())`,
      [randomUUID(), ids.session],
    );
    // The foreign session shares the seq on purpose: equality against it must
    // still be a 404, not a "no change" that confirms a stranger's token.
    await client.query(
      `INSERT INTO workout_sessions (id, user_id, routine_day_id, client_id, local_date, status, phase, source, server_seq, started_at)
       VALUES ($1, $2, $3, gen_random_uuid(), '2026-09-08', 'in_progress', 'exercise', 'app', $4, '2026-09-08T12:00:00Z')`,
      [ids.foreignSession, foreign.userId, ids.routineDay, SERVER_SEQ],
    );
  });

  afterAll(async () => {
    if (client) {
      await client.query('DELETE FROM session_tasks WHERE session_id = $1', [ids.session]);
      await client.query('DELETE FROM session_sets WHERE session_id = $1', [ids.session]);
      await client.query('DELETE FROM workout_sessions WHERE id = ANY($1)', [[ids.session, ids.foreignSession]]);
      await client.query('DELETE FROM routine_exercises WHERE id = $1', [ids.routineExercise]);
      await client.query('DELETE FROM routine_days WHERE id = $1', [ids.routineDay]);
      await client.query('DELETE FROM exercises WHERE id = $1', [ids.exercise]);
      await client.query('DELETE FROM profiles WHERE id = ANY($1)', [[owner?.userId, foreign?.userId]]);
      await client.end();
    }
    if (owner) await owner.cleanup();
    if (foreign) await foreign.cleanup();
    await stopApiServer();
  });

  /*
   * `ROUTE_BUDGET_MS` below is a *timing* budget, not a weakened assertion: every
   * expectation in this file is unchanged. The harness serves these requests from
   * `next dev`, so the first call into a route pays for on-demand compilation before
   * answering, and this test then makes two calls. Observed once on a loaded 4-core
   * box at 5021 ms against vitest's 5 s default (and green in isolation on the same
   * tree, twice); the same suite's `beforeAll` already allows 30 s for the same
   * reason, per the `hookTimeout` note in `vitest.config.ts`.
   *
   * Leaving a byte-comparison assertion to fail because a laptop was busy is not a
   * stricter gate — it is a flake that teaches everyone to re-run CI.
   */
  const ROUTE_BUDGET_MS = 20_000;

  it('answers since === server_seq with no session body — measured bytes', async () => {
    const full = await get('', owner);
    expect(full.status).toBe(200);
    const fullBody = await full.text();

    const fresh = await get(`?since=${SERVER_SEQ}`, owner);
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get('cache-control')).toBe('no-store');
    const freshBody = await fresh.text();

    const parsed = SessionNotModifiedResponseSchema.parse(JSON.parse(freshBody));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data).toEqual({ notModified: true, serverSeq: SERVER_SEQ });
    // The cheap-poll claim, measured: RFC §8.3 leans on this gap. Both lengths
    // are logged so the PR description cites numbers from this run, not hope.
    console.info(`delta bytes: full=${fullBody.length} notModified=${freshBody.length}`);
    expect(freshBody.length * 10).toBeLessThan(fullBody.length);
  }, ROUTE_BUDGET_MS);

  it('answers since < server_seq with the full session at the current seq', async () => {
    const response = await get(`?since=${SERVER_SEQ - 1}`, owner);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await responseBody(response);
    expect(SessionNotModifiedResponseSchema.safeParse(body).success).toBe(false);
    const parsed = SessionDetailResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.ok) {
      expect(parsed.data.data).toMatchObject({ id: ids.session, serverSeq: SERVER_SEQ });
      expect((parsed.data.data as { sets: unknown[] }).sets).toHaveLength(3);
    }
  });

  it('answers a from-the-future since with full state, never an error or a no-op', async () => {
    for (const since of [SERVER_SEQ + 1, 99]) {
      const response = await get(`?since=${since}`, owner);
      expect(response.status).toBe(200);
      const parsed = SessionDetailResponseSchema.safeParse(await responseBody(response));
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.ok) {
        expect(parsed.data.data).toMatchObject({ id: ids.session, serverSeq: SERVER_SEQ });
      }
    }
  });

  it('keeps the no-since read unchanged: full session, so M2 clients do not care', async () => {
    const response = await get('', owner);
    expect(response.status).toBe(200);
    const parsed = SessionDetailResponseSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.ok) {
      expect(parsed.data.data).toMatchObject({ id: ids.session });
    }
  });

  it('404s another user’s session at its own matching seq — no stranger-token confirmation', async () => {
    const response = await apiRequest(`/api/sessions/${ids.foreignSession}?since=${SERVER_SEQ}`, {
      headers: authHeaders(owner),
    });
    await expectAppError(response, 404, 'NOT_FOUND');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.status).not.toBe(200);
  });

  it('rejects unauthenticated deltas with 401 and malformed since with 400', async () => {
    const anon = await apiRequest(`/api/sessions/${ids.session}?since=${SERVER_SEQ}`);
    await expectAppError(anon, 401, 'UNAUTHENTICATED');

    await expectAppError(await get('?since=not-a-number', owner), 400, 'VALIDATION_ERROR');
    await expectAppError(await get('?since=-1', owner), 400, 'VALIDATION_ERROR');
    await expectAppError(await get('?since=1.5', owner), 400, 'VALIDATION_ERROR');
  });
});
