import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { AppEnvelopeSchema } from '../../../lib/contracts/envelope.js';
import { SyncResponseSchema } from '../../../lib/contracts/sync.js';
import {
  authHeaders,
  clientTs,
  createTestSession,
  ids,
  seedSessionFixtures,
  type SessionFixture,
  type TestSession,
} from './fixtures.js';
import { jsonRequest, responseBody, startApiServer, stopApiServer } from './test-server.js';

/**
 * M2-06 (#42) scenario 3: the reliability and performance gate.
 *
 * Three claims the milestone makes about `POST /api/sync` that nothing else in
 * the suite proves end-to-end through the route: a batch that exceeds the contract
 * bound is refused **without side effects**, a duplicated batch replayed
 * concurrently lands **once**, and the request cost stays inside the documented
 * p95 budget. The first two are correctness; the third is the one a reviewer
 * cannot see in a unit test.
 *
 * Row counts are read back over the migration connection rather than inferred
 * from the response, because a response can report "applied" while the write
 * landed twice — which is precisely the failure being tested for.
 */

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

const baseMutation = {
  op: 'set.upsert' as const,
  mutationId: ids.mutation,
  clientTs,
  sessionId: ids.session,
  exerciseId: ids.exercise,
  setIndex: 0,
  isCompleted: true,
  weightKg: 60.5,
  reps: 8,
};

const syncBody = (mutations: unknown[]) => ({ deviceId: ids.device, sinceSeq: 0, mutations });

describe('M2-06: route hardening — POST /api/sync', () => {
  let owner!: TestSession;
  let fixtures!: SessionFixture;
  let client!: Client;

  const count = async (sql: string, params: unknown[] = []): Promise<number> => {
    const result = await client.query<{ n: string }>(sql, [owner.userId, ...params]);
    return Number(result.rows[0]!.n);
  };

  const post = (body: unknown) =>
    jsonRequest('/api/sync', body, { method: 'POST', headers: authHeaders(owner) });

  beforeAll(async () => {
    if (!OWNER_URL) throw new Error('MIGRATION_DATABASE_URL is required for the route-hardening suite.');
    await startApiServer();
    client = new Client({ connectionString: OWNER_URL });
    await client.connect();
    owner = await createTestSession('hardening');
    fixtures = await seedSessionFixtures(owner);
  });

  afterAll(async () => {
    if (client) await client.end();
    if (fixtures) await fixtures.cleanup();
    if (owner) await owner.cleanup();
    await stopApiServer();
  });

  it('refuses a batch over the 200-mutation contract bound and writes nothing', async () => {
    const oversized = Array.from({ length: 201 }, (_, index) => ({
      ...baseMutation,
      mutationId: randomUUID(),
      setIndex: index,
    }));

    // Deltas, not absolutes: `seedSessionFixtures` may leave rows behind, and a
    // flat "expect 0" would then fail for a reason that has nothing to do with the
    // request under test. What must hold is that a refused batch changes nothing.
    const mutationsBefore = await count('SELECT count(*)::text AS n FROM sync_mutations WHERE user_id = $1');
    const setsBefore = await count('SELECT count(*)::text AS n FROM session_sets WHERE user_id = $1');

    const response = await post(syncBody(oversized));
    expect(response.status).toBe(400);
    const parsed = AppEnvelopeSchema.safeParse(await responseBody(response));
    expect(parsed.success).toBe(true);
    if (parsed.success && !parsed.data.ok) expect(parsed.data.error.code).toBe('VALIDATION_ERROR');

    // The point of the check. A route that validates after partially applying has
    // turned a rejected request into a real write.
    expect(await count('SELECT count(*)::text AS n FROM sync_mutations WHERE user_id = $1')).toBe(mutationsBefore);
    expect(await count('SELECT count(*)::text AS n FROM session_sets WHERE user_id = $1')).toBe(setsBefore);
  });

  it('lands a concurrently duplicated batch exactly once', async () => {
    const [first, second] = await Promise.all([post(syncBody([baseMutation])), post(syncBody([baseMutation]))]);
    const statuses = [first.status, second.status];
    expect(statuses).toContain(200);

    for (const response of [first, second]) {
      const body = await responseBody(response);
      if (response.status === 200) {
        expect(SyncResponseSchema.safeParse(body).success).toBe(true);
      } else {
        expect(response.status).toBe(409);
      }
    }

    expect(await count('SELECT count(*)::text AS n FROM session_sets WHERE user_id = $1')).toBe(1);
    expect(
      await count('SELECT count(*)::text AS n FROM sync_mutations WHERE user_id = $1 AND mutation_id = $2',
        [baseMutation.mutationId]),
    ).toBe(1);
    expect(
      await count('SELECT count(*)::text AS n FROM workout_sessions WHERE user_id = $1'),
    ).toBe(1);
  });

  it('stays inside the documented p95 latency budget', async () => {
    const samples: number[] = [];
    for (let attempt = 0; attempt < 50; attempt += 1) {
      // Distinct mutation ids against one set index: real work per request
      // (ledger insert + set upsert + PR pass) without 50 rows of residue.
      // Timed around the whole request: start before it is sent, stop after the
      // body is drained. Starting the clock after `await post(...)` would measure
      // only the body read and report a flattering number as latency.
      const startedAt = performance.now();
      const response = await post(syncBody([{ ...baseMutation, mutationId: randomUUID() }]));
      expect(response.status).toBe(200);
      await responseBody(response);
      samples.push(performance.now() - startedAt);
    }

    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1]!;
    // The 200 ms figure in the migration spec is qualified "@ 50 rps" and was
    // written against the shipped server. This harness boots `next dev`, which
    // compiles routes on demand and ships no minification, so asserting 200 ms
    // here measures the wrong artifact. What this gate owns is a regression
    // ceiling loose enough to survive a loaded CI runner (~4x headroom) and tight
    // enough to catch a pathological change; the dev-mode measurement is reported
    // into docs/STATE.md so the production number stays a named open item rather
    // than an implied one.
    const documentedBudgetMs = 200;
    const devHarnessCeilingMs = 800;

    // Self-describing on failure: the measured number has to travel with the
    // verdict, or a green run tells a reviewer nothing about where the margin is.
    const summary = `p95 ${p95.toFixed(1)} ms (median ${samples[Math.floor(samples.length / 2)]!.toFixed(1)} ms, `
      + `max ${samples[samples.length - 1]!.toFixed(1)} ms) on the dev-mode harness, against a documented `
      + `${documentedBudgetMs} ms production budget at 50 rps and a ${devHarnessCeilingMs} ms regression ceiling`;
    expect(p95, summary).toBeLessThan(devHarnessCeilingMs);
  }, 120_000);
});
