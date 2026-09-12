/**
 * M4-01 (#90) — the 50 rps sustained load harness for `POST /api/sync`.
 *
 * Why this exists: the documented budget is **200 ms p95 at 50 rps**, and every number this repo has recorded
 * about that route is sequential — 50 requests, one at a time. `route-hardening.test.ts:155-162` explains why
 * it refuses to assert 200 ms itself (it boots `next dev`, "measures the wrong artifact") and leaves the
 * production figure "a named open item rather than an implied one". This is the instrument that owns it.
 * Design and the verified mechanisms: `docs/perf/2026-09-12-m4-90-load-harness-design.md`.
 *
 * Three rules the script is built around, because a load report is easy to write in a way that flatters:
 *
 * 1. **Percentiles are over accepted (2xx) responses only; rejections are counted on their own line.**
 *    A 429 returns *before* the ledger insert, set upsert and PR pass, so folding rejections into the sample
 *    reports a better p95 while the server did less work. `n=` and the achieved accepted rps print beside the
 *    verdict, so a PASS that delivered 12 rps is visibly that run.
 * 2. **The denominator travels with the number.** `nproc` and `/proc/loadavg` are captured before and after,
 *    per `docs/rca/m4-100-contention-ledger.md`: a missing denominator makes a timing figure an anecdote, and
 *    a recorded high load explains a red without disqualifying a green.
 * 3. **The 200 ms figure is never edited here.** A MISS is the harness working. When it misses the fix is
 *    #92, not this file — and the deliberate-slowdown control (design doc) is what proves the difference.
 *
 * Deliberately outside CI's merge gate, per the card's scope: a CI runner cannot hold 50 rps honestly.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Pool } from 'pg';
import {
  authHeaders,
  clientTs,
  createTestSession,
  seedSessionFixtures,
  type FixtureIds,
  type SessionFixture,
  type TestSession,
} from '../tests/integration/api/fixtures';

const LATENCY_BUDGET_MS = 200;

interface Options {
  baseUrl: string;
  targetRps: number;
  durationMs: number;
  users: number;
  label: string;
  mutationsPerRequest: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`);
    const value = argv[index + 1];
    return index >= 0 && value !== undefined ? value : fallback;
  };
  const numeric = (name: string, fallback: number): number => {
    const raw = get(name, String(fallback));
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`--${name} must be a positive number, got "${raw}"`);
    }
    return parsed;
  };
  return {
    baseUrl: get('base-url', 'http://localhost:3001'),
    targetRps: numeric('rps', 50),
    durationMs: numeric('duration', 60) * 1000,
    users: numeric('users', 30),
    label: get('label', 'm4-90'),
    mutationsPerRequest: numeric('mutations', 1),
  };
}

/**
 * One mutation per request by default, against a seeded session: real work (ledger insert + set upsert + PR
 * pass) without the 200-mutation cap being what is measured. `lib/contracts/sync.ts` requires every mutation
 * in a batch to target one session and caps the array at 200.
 */
function syncBody(ids: FixtureIds, mutationCount: number): string {
  const mutations = Array.from({ length: mutationCount }, () => ({
    op: 'set.upsert' as const,
    // Fresh id per request. A replayed mutationId is deduplicated, and a deduplicated request that returns
    // early is a fast path wearing the cost of real work.
    mutationId: randomUUID(),
    clientTs,
    sessionId: ids.session,
    exerciseId: ids.exercise,
    setIndex: 0,
    isCompleted: true,
    weightKg: 60.5,
    reps: 8,
  }));
  return JSON.stringify({ deviceId: ids.device, sinceSeq: 0, mutations });
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? Number.NaN;
}

function loadavg(): string {
  try {
    return readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/).slice(0, 3).join(' ');
  } catch {
    return 'unavailable';
  }
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : 'n/a';
}

interface BackendState {
  active: number;
  total: number;
  idleInTransaction: number;
}

async function sampleBackends(observer: Pool): Promise<BackendState> {
  const rows = await observer.query<{ state: string; n: number }>(
    `select coalesce(nullif(state, ''), 'NULL') as state, count(*)::int as n
       from pg_stat_activity
      where datname = current_database()
      group by 1`,
  );
  const state: BackendState = { active: 0, total: 0, idleInTransaction: 0 };
  for (const row of rows.rows) {
    state.total += row.n;
    if (row.state === 'active') state.active += row.n;
    if (row.state === 'idle in transaction') state.idleInTransaction += row.n;
  }
  return state;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.MIGRATION_DATABASE_URL) {
    console.error('M4-01: MIGRATION_DATABASE_URL is required (it is also how the DB side is observed).');
    console.error('Reproduce with:  npm run db:up && npm run next:build && npm run next:start');
    return 2;
  }
  const perUserRps = options.targetRps / options.users;
  const intervalMs = 1000 / perUserRps;

  console.log(
    `M4-01 load harness — ${options.baseUrl}/api/sync, ${options.targetRps} rps offered for ` +
      `${(options.durationMs / 1000).toFixed(0)} s across ${options.users} users ` +
      `(${perUserRps.toFixed(2)} rps each, ${options.mutationsPerRequest} mutation/request)`,
  );
  console.log(`DENOMINATOR  nproc=${cpus().length} load_before=${loadavg()}`);

  // The app's pg.Pool is reachable only inside the server process (lib/db/client.ts:8 exposes DbHandle.pool),
  // and this driver is an external HTTP client, so concurrency is read from the database's own account of it.
  // That is *server-side connection state*, not the app's pool queue depth, and the report says so.
  const observer = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 2 });
  const created: TestSession[] = [];
  const fixtures: SessionFixture[] = [];
  const accepted: number[] = [];
  const rejected: number[] = [];
  const statusCounts = new Map<string, number>();
  let maxActive = 0;
  let maxTotal = 0;
  let maxIdleInTransaction = 0;
  let observerErrors = 0;
  let offered = 0;
  let running = true;

  const tally = (key: string): void => {
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  };

  try {
    for (let index = 0; index < options.users; index += 1) {
      const session = await createTestSession(`${options.label}-${index}`);
      created.push(session);
      const fixture = await seedSessionFixtures(session);
      fixtures.push(fixture);
    }
    console.log(`SETUP        ${created.length} authenticated users, each with seeded session/exercise rows`);

    const observerLoop = (async () => {
      while (running) {
        try {
          const state = await sampleBackends(observer);
          maxActive = Math.max(maxActive, state.active);
          maxTotal = Math.max(maxTotal, state.total);
          maxIdleInTransaction = Math.max(maxIdleInTransaction, state.idleInTransaction);
        } catch {
          observerErrors += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    })();

    const startedAt = performance.now();
    const deadline = startedAt + options.durationMs;

    const runUser = async (session: TestSession, ids: FixtureIds): Promise<void> => {
      // Self-correcting schedule: each slot is computed from the start rather than from "now + interval", so
      // one slow response cannot drag this user's rate down and quietly lower the offered load.
      let slot = 0;
      for (;;) {
        const at = startedAt + slot * intervalMs;
        const waitMs = at - performance.now();
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        if (performance.now() >= deadline) return;
        slot += 1;
        offered += 1;
        const begin = performance.now();
        try {
          const response = await fetch(`${options.baseUrl}/api/sync`, {
            method: 'POST',
            headers: { ...authHeaders(session), 'content-type': 'application/json' },
            body: syncBody(ids, options.mutationsPerRequest),
          });
          // Drain before stopping the clock. Stopping when headers arrive measures the start of a response and
          // reports it as latency, which is the flattering version of this number.
          await response.text();
          const elapsedMs = performance.now() - begin;
          tally(String(response.status));
          if (response.ok) accepted.push(elapsedMs);
          else rejected.push(elapsedMs);
        } catch (error) {
          tally('fetch-error');
          if (process.env.PERF_DEBUG) console.error('  request failed:', (error as Error).message);
        }
      }
    };

    await Promise.all(created.map((session, index) => {
      const ids = fixtures[index]?.ids;
      if (!ids) throw new Error(`fixture ${index} was never seeded; refusing to under-report the run`);
      return runUser(session, ids);
    }));
    running = false;
    await observerLoop;

    const elapsedS = Math.max(0.001, (performance.now() - startedAt) / 1000);
    accepted.sort((left, right) => left - right);
    const countOf = (status: string): number => statusCounts.get(status) ?? 0;
    const serverErrors = countOf('500') + countOf('502') + countOf('503') + countOf('504');
    const p50 = percentile(accepted, 0.5);
    const p95 = percentile(accepted, 0.95);
    const maxMs = accepted.length > 0 ? (accepted[accepted.length - 1] ?? Number.NaN) : Number.NaN;

    console.log(
      `OFFERED      ${offered} requests over ${elapsedS.toFixed(1)} s = ` +
        `${(offered / elapsedS).toFixed(1)} rps (target ${options.targetRps.toFixed(1)})`,
    );
    console.log(
      `ACCEPTED     n=${accepted.length} → ${(accepted.length / elapsedS).toFixed(1)} rps achieved | ` +
        `p50=${fmt(p50)} p95=${fmt(p95)} max=${fmt(maxMs)} ms  (2xx only)`,
    );
    console.log(
      `REJECTED     n=${rejected.length} 429=${countOf('429')} 5xx=${serverErrors} ` +
        `other=${rejected.length - countOf('429') - serverErrors} fetch_error=${countOf('fetch-error')}` +
        `  (excluded from the percentiles above, by design)`,
    );
    if (countOf('429') > 0) {
      console.log(
        `             429s are fast by construction — they return before the write — so including them would` +
          ` lower p95 while the server did less work. That is the bias this split removes.`,
      );
    }
    if (serverErrors > 0) {
      console.log(
        `             NOTE: 5xx responses are excluded too, and they are NOT fast rejections. A 500 after the` +
          ` write did the work, so leaving it out is a separate bias, disclosed rather than hidden.`,
      );
    }
    if (accepted.length > 0 && Math.abs(p95 - maxMs) < 1e-9) {
      console.log(
        `             NOTE: p95 == max at n=${accepted.length}. At small n the 95th-percentile index lands on` +
          ` the last element, so this "p95" is one request, not a distribution (#121's exact failure shape).`,
      );
    }
    console.log(
      `DB-SIDE      max_active_backends=${maxActive} max_total_backends=${maxTotal} ` +
        `max_idle_in_transaction=${maxIdleInTransaction} observer_errors=${observerErrors}`,
    );
    console.log(
      `             (pg_stat_activity over the migration DSN: server connection state. The app's in-process` +
        ` pool.waitingCount is not readable from an external driver — see the design doc, item 1.)`,
    );
    console.log(`DENOMINATOR  load_after=${loadavg()}`);
    console.log(`STATUS       ${[...statusCounts.entries()].map(([k, v]) => `${k}:${v}`).join(' ')}`);

    const verdictOK = accepted.length > 0 && Number.isFinite(p95) && p95 < LATENCY_BUDGET_MS;
    console.log(
      `VERDICT      ${verdictOK ? 'PASS' : 'MISS'} — p95 ${fmt(p95)} ms vs the documented ` +
        `${LATENCY_BUDGET_MS} ms at ${options.targetRps} rps. The budget is a product goal; this script does` +
        ` not edit it.`,
    );
    if (!verdictOK) {
      console.log(
        `             A MISS is the harness working. Closing the gap is #92's job, not this file's.` +
          (accepted.length === 0 ? ' (n=0 accepted: nothing was measured — check the server and the stack.)' : ''),
      );
    }
    return verdictOK ? 0 : 1;
  } finally {
    running = false;
    for (const fixture of fixtures) await fixture.cleanup().catch(() => undefined);
    for (const session of created) await session.cleanup().catch(() => undefined);
    await observer.end().catch(() => undefined);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`M4-01 harness aborted: ${(error as Error).message}`);
    process.exit(2);
  });
