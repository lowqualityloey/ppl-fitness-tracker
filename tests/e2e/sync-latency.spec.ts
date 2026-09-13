import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  authHeaders,
  createTestSession,
  seedSessionFixtures,
  type SessionFixture,
  type TestSession,
} from '../integration/api/fixtures.js';
import { latencySummary } from './latency-helpers.js';

/**
 * M3-03 (#60), task item 4: the first **production-mode** numbers for the sync
 * endpoint, and a baseline to read them against.
 *
 * M2-06 (#53) measured `POST /api/sync` and refused to assert the documented
 * 200 ms budget, because the only harness it had booted `next dev`. It shipped a
 * `p95 < 800 ms` dev-harness ceiling with a comment naming the gap, and
 * `docs/STATE.md` §5 has carried "production p95 unmeasured" ever since. This file
 * pays that debt — **including the part where the answer is a miss**: the card for
 * this slice says the result is recorded whichever way it falls.
 *
 * Both measurements live in one file on purpose. "p95 = 362 ms" alone is an
 * unattributed number; next to a no-auth baseline over the same server it becomes a
 * statement about where the time goes. Neither is a load test — the documented SLA
 * is p95 < 200 ms *at 50 rps*, which is M4's work.
 *
 * Requires `.env.local` in the environment (`set -a; . ./.env.local; set +a`), like
 * the API suites: fixtures seed through the owner DSN while requests go through the
 * app's own auth path against the production server on :3001.
 *
 * Timing is captured from before the request to *after the response body is read*.
 * An earlier draft started the clock after awaiting the response and would have
 * reported a p95 of roughly nothing — the specific way a latency test becomes a lie.
 */

const REQUESTS = 50;
const READ_REQUESTS = 30;
/** The documented budget: `docs/specs/2026-09-08-spec-fullstack-migration.md` §3. */
const documentedBudgetMs = 200;
/**
 * The ceiling actually enforced, kept identical to M2-06's so the two records stay
 * comparable. It is a *regression* bound for this machine, not the SLA: the SLA's
 * condition is 50 rps, which nothing here produces. Asserting 200 ms would either
 * red-line the suite on every dev box or get quietly raised the first time someone
 * was in a hurry — so the budget stays in the printed message and the miss stays in
 * STATE §5 as a named, open item.
 */
const devHarnessCeilingMs = 800;

function report(label: string, samples: number[]) {
  const s = latencySummary(samples);
  const summary =
    `${label} over ${s.n} sequential requests on the production build — ` +
    `p50 ${s.median.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms, max ${s.max.toFixed(1)} ms (aboveP95=${s.aboveP95})`;
  return { p50: s.median, p95: s.p95, max: s.max, summary };
}

function verdict(result: { p95: number }, summary: string): string {
  const against = result.p95 < documentedBudgetMs ? 'inside' : 'MISSES';
  return `${summary} — versus documented ${documentedBudgetMs} ms budget: ${against} (enforced ceiling ${devHarnessCeilingMs} ms)`;
}

test.describe('production-mode measurements — POST /api/sync', () => {
  /*
   * One worker for this file, for two reasons that are the same reason.
   *
   * The first reason is historical and #80 closed it: this file used to be the incident.
   * `seedSessionFixtures` used to create rows for a **fixed** id set (`session: 2222…`,
   * `exercise: 3333…`) and delete exactly those ids on its way in and out, so under
   * `fullyParallel: true` the file's two tests could land in two processes and one would be
   * measuring its 50 writes while the other's cleanup deleted the session underneath it — which is
   * what #64 recorded as `request 18: status=404 … "code":"NOT_FOUND"`, passing in isolation and on
   * a quieter re-run. The ids are now minted per seeding call (`fixtures.ids`), so a sibling's
   * `DELETE` cannot reach this run's rows: the collision is gone by construction rather than
   * scheduled around.
   *
   * The second reason is why `serial` stays, and it is not about rows: these are *latency
   * measurements*. Another worker's 50 sequential writes against the same local server is load, and
   * load is the thing this spec exists to characterise, not introduce — which is also why #100 has
   * to keep this pin honest rather than celebrate it. Serialising a benchmark is a scheduling fact
   * about one file, not a weakened assertion: every threshold and expectation below is untouched.
   */
  // `serial` is Playwright's one-worker mode for a file: its tests run in sequence, in a single
  // process. (`singleWorker` is not a member of `configure`'s `mode` union in 1.63.)
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(180_000);

  test(`p95 over ${REQUESTS} single-mutation batches, against the ${documentedBudgetMs} ms documented budget`, async ({
    request,
  }) => {
    const owner: TestSession = await createTestSession('e2e-sync-latency');
    const fixtures: SessionFixture = await seedSessionFixtures(owner);

    try {
      const samples: number[] = [];
      let sinceSeq = 0;

      /*
       * One timestamp per request, one millisecond apart. The spec used to hold a single
       * `clientTs` constant for all fifty writes, and that was wrong twice over: it is not
       * what an outbox sends (each queued mutation carries the moment the user tapped), and
       * it made the test a coin flip. `compareEntityVersions` breaks a timestamp tie by
       * `deviceId` and then by `mutationId`, so a re-tick of the same slot with an equal
       * timestamp wins or loses on a random UUID — and this spec deliberately re-ticks
       * three slots forty-seven times. It had only ever passed because the production build
       * was slow enough that every `clientTs` fell outside `CLOCK_SKEW_LIMIT_MS` of
       * `receivedAt`, which pinned `effectiveTs` to the receive clock and made the ordering
       * monotone by accident. Re-running it against an already-built server reproduced
       * `STALE_CONFLICT` at request 8.
       */
      const firstClientTs = Date.now();

      for (let index = 0; index < REQUESTS; index += 1) {
        const mutation = {
          op: 'set.upsert' as const,
          mutationId: randomUUID(),
          clientTs: new Date(firstClientTs + index).toISOString(),
          sessionId: fixtures.ids.session,
          exerciseId: fixtures.ids.exercise,
          // Three legal slots, cycled. The seeded routine exercise plans 3 sets and
          // M2-04 rejects a setIndex beyond the plan with INVALID_MUTATION: the first
          // draft counted 0..49 and lost the run at index 3. Re-ticking the same slots
          // is also the more faithful workload, since that is what an outbox does when
          // a user adjusts a set they already tapped, and every write still advances
          // server_seq.
          setIndex: index % 3,
          isCompleted: true,
          weightKg: 60 + (index % 10) * 2.5,
          reps: 8,
        };

        const startedAt = performance.now();
        const response = await request.post('/api/sync', {
          // `authHeaders` is typed for fetch's `HeadersInit`; Playwright's option is
          // narrower and fetch accepts both. Cast rather than duplicate the cookie
          // builder, so there stays exactly one definition of "authenticated".
          headers: authHeaders(owner) as Record<string, string>,
          data: { deviceId: fixtures.ids.device, sinceSeq, mutations: [mutation] },
        });
        const body = (await response.json()) as {
          ok?: boolean;
          error?: { code?: string; message?: string };
          data?: { serverSeq?: number; applied?: string[]; rejected?: unknown[] };
        };
        const elapsedMs = performance.now() - startedAt;

        // Name the rejection, not just the count: a bare "expected 1, received 0"
        // sends the next reader into the server code to find out why.
        const context = `request ${index}: status=${response.status()} applied=${JSON.stringify(body.data?.applied)} rejected=${JSON.stringify(body.data?.rejected)} error=${JSON.stringify(body.error)}`;
        expect(response.status(), context).toBe(200);
        expect(body.ok, `non-success envelope — ${context}`).toBe(true);
        expect(body.data?.applied?.length, context).toBe(1);

        sinceSeq = body.data?.serverSeq ?? sinceSeq;
        samples.push(elapsedMs);
      }

      // Every sample must be a real applied write, or the distribution measures the
      // validation path instead of the sync path.
      expect(samples.length, 'all batches must apply').toBe(REQUESTS);

      const result = report('POST /api/sync (authenticated write)', samples);
      console.info(`[measurement] ${verdict(result, result.summary)}`);
      test.info().annotations.push({ type: 'measurement', description: verdict(result, result.summary) });
      expect(result.p95, verdict(result, result.summary)).toBeLessThan(devHarnessCeilingMs);
    } finally {
      await fixtures.cleanup();
    }
  });

  test(`no-auth baseline over ${READ_REQUESTS} GETs of the public library`, async ({ request }) => {
    /**
     * The control for the measurement above. `GET /api/exercises` is the public
     * system-exercise list (M2-06): no `requireUserContext()`, therefore **no GoTrue
     * round trips**, and no per-user transaction. If the authenticated write path is
     * materially slower than this, the difference is attributable to auth and
     * user-scoped work rather than to the prod server or Postgres being slow today.
     */
    const samples: number[] = [];

    for (let index = 0; index < READ_REQUESTS; index += 1) {
      const startedAt = performance.now();
      const response = await request.get('/api/exercises');
      const body: unknown = await response.json();
      const elapsedMs = performance.now() - startedAt;

      expect(response.status(), `read ${index}`).toBe(200);
      expect(body, `read ${index} must return an envelope`).toBeTruthy();
      samples.push(elapsedMs);
    }

    const result = report('GET /api/exercises (no auth, read)', samples);
    console.info(`[measurement] ${verdict(result, result.summary)}`);
    test.info().annotations.push({ type: 'measurement', description: verdict(result, result.summary) });
    expect(result.p95, verdict(result, result.summary)).toBeLessThan(devHarnessCeilingMs);
  });
});
