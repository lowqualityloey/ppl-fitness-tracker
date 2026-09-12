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
  /** Client-side ceiling on concurrent requests. Hitting it is counted, never used to lower the target. */
  maxInflight: number;
  /** How long to wait after the deadline for in-flight responses before declaring them unfinished. */
  drainGraceMs: number;
}

const FLAG_NAMES = [
  'base-url',
  'rps',
  'duration',
  'users',
  'label',
  'mutations',
  'max-inflight',
  'drain-grace',
] as const;

/**
 * Accepts both `--users 30` and `--users=30`, and refuses an unknown flag.
 *
 * The `=` form is not a nicety: the first run of this harness was intended as a 3-user / 6 rps / 5 s pilot,
 * and npm hands flags over as `--users=3`, which the original space-only matcher never saw — so every setting
 * silently fell back to its default and the "pilot" became a full 30-user 60 s run at 50 rps on a 4-core box.
 * An unrecognised flag is a hard error for the same reason: a flag that gets ignored is a run whose
 * parameters are not the parameters that were typed, and nothing downstream can tell.
 */
function parseArgs(argv: string[]): Options {
  const get = (name: string, fallback: string): string => {
    const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
    if (inline !== undefined) return inline.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    const value = index >= 0 ? argv[index + 1] : undefined;
    if (index >= 0 && value !== undefined && !value.startsWith('--')) return value;
    return fallback;
  };
  for (const entry of argv) {
    const name = (entry.split('=')[0] ?? '').trim();
    if (name.startsWith('--') && !(FLAG_NAMES as readonly string[]).includes(name.slice(2))) {
      throw new Error(
        `unknown flag "${name}" — refusing to run with a parameter that would be ignored.\n` +
          `         Known: ${FLAG_NAMES.map((flag) => `--${flag}`).join(', ')}`,
      );
    }
  }
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
    maxInflight: numeric('max-inflight', 64),
    drainGraceMs: numeric('drain-grace', 30) * 1000,
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

    // ---- Open-loop scheduler (finding B) -------------------------------------------------------------
    // The first version ran one request per user and awaited it, so offered load collapsed to
    // `users / latency`: at ~3.2 s p50 with 30 users it offered 8.8 rps against a 50 rps target. A generator
    // that goes quiet exactly when the system slows down cannot answer a latency question, so the pacer now
    // fires on a global clock without waiting for responses. Concurrency is capped by `--max-inflight`, and
    // reaching the cap is counted as `backpressure_ticks` and printed: a client-side ceiling that silently
    // lowers offered load is the same failure wearing a different hat.
    const tickMs = 1000 / options.targetRps;
    let inFlight = 0;
    let maxInFlight = 0;
    let backpressureTicks = 0;

    // `requireUserContext()` verifies by calling `supabase.auth.getUser()`, i.e. **every** /api/sync request
    // makes an outbound hop to GoTrue and any failure there is reported as our own 401. That makes 401
    // ambiguous: an invalid session, or a valid one whose verification hop shed under load. The discriminator
    // needs no new machinery — each user keeps firing with the same cookie, so a 2xx that arrives *after* a
    // 401 from that same user is direct evidence the credential was never the problem.
    interface Track {
      sawReject: boolean;
      recoveries: number;
    }
    const tracks = created.map<Track>(() => ({ sawReject: false, recoveries: 0 }));
    let rejectSample = '';
    let rejectSetCookie = 'none';

    const fire = (index: number): void => {
      const session = created[index];
      const ids = fixtures[index]?.ids;
      const track = tracks[index];
      if (!session || !ids || !track) {
        throw new Error(`driver ${index} was never set up; refusing to under-report the run`);
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      offered += 1;
      const begin = performance.now();
      void (async () => {
        try {
          const response = await fetch(`${options.baseUrl}/api/sync`, {
            method: 'POST',
            headers: { ...authHeaders(session), 'content-type': 'application/json' },
            body: syncBody(ids, options.mutationsPerRequest),
          });
          // Drain before stopping the clock. Stopping when headers arrive measures the start of a response and
          // reports it as latency, which is the flattering version of this number.
          const text = await response.text();
          const elapsedMs = performance.now() - begin;
          tally(String(response.status));
          if (response.ok) {
            accepted.push(elapsedMs);
            if (track.sawReject) track.recoveries += 1;
          } else {
            rejected.push(elapsedMs);
            track.sawReject = true;
            if (!rejectSample) {
              rejectSample = `${response.status} ${text.slice(0, 220)}`;
              rejectSetCookie = response.headers.get('set-cookie')
                ? `present (${(response.headers.get('set-cookie') ?? '').slice(0, 40)}…)`
                : 'absent';
            }
          }
        } catch (error) {
          tally('fetch-error');
          if (process.env.PERF_DEBUG) console.error('  request failed:', (error as Error).message);
        } finally {
          inFlight -= 1;
        }
      })();
    };

    let cursor = 0;
    for (let slot = 0; ; slot += 1) {
      const at = startedAt + slot * tickMs;
      const waitMs = at - performance.now();
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (performance.now() >= deadline) break;
      if (inFlight >= options.maxInflight) {
        backpressureTicks += 1;
        continue;
      }
      const index = cursor % created.length;
      cursor += 1;
      fire(index);
    }

    // Drain with a grace window. Anything still open when it closes is counted as `unfinished` and stays out
    // of the sample — dropping it silently would report the fast half of a distribution and call it p95.
    const drainUntil = performance.now() + options.drainGraceMs;
    while (inFlight > 0 && performance.now() < drainUntil) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const unfinished = inFlight;
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
      `CLIENT       max_in_flight=${maxInFlight} (cap ${options.maxInflight}) ` +
        `backpressure_ticks=${backpressureTicks} unfinished_at_grace=${unfinished}`,
    );
    if (backpressureTicks > 0 || unfinished > 0) {
      console.log(
        `             the client limited this run, not the server: ${backpressureTicks} ticks were skipped at` +
          ` the in-flight cap and ${unfinished} requests were still open when the grace window closed. Neither` +
          ` is in the percentiles; raise --max-inflight / --drain-grace before reading the verdict.`,
      );
    }
    console.log(
      `ACCEPTED     n=${accepted.length} → ${(accepted.length / elapsedS).toFixed(1)} rps achieved | ` +
        `p50=${fmt(p50)} p95=${fmt(p95)} max=${fmt(maxMs)} ms  (2xx only)`,
    );
    console.log(
      `REJECTED     n=${rejected.length} 429=${countOf('429')} 5xx=${serverErrors} ` +
        `other=${rejected.length - countOf('429') - serverErrors} fetch_error=${countOf('fetch-error')}` +
        `  (excluded from the percentiles above, by design)`,
    );
    const usersWithReject = tracks.filter((track) => track.sawReject).length;
    const usersThatRecovered = tracks.filter((track) => track.recoveries > 0).length;
    if (countOf('401') > 0) {
      console.log(
        `AUTH         401=${countOf('401')} users_ever_rejected=${usersWithReject} ` +
          `users_later_accepted_with_the_same_cookie=${usersThatRecovered}`,
      );
      console.log(
        usersThatRecovered === usersWithReject && usersWithReject > 0
          ? `             EVERY rejected user subsequently succeeded on the same credential, so the session was` +
            ` never invalid: these 401s are the auth verification hop failing under load and being reported as` +
            ` unauthenticated by requireUserContext(), not a client problem.`
          : `             ${usersWithReject - usersThatRecovered} user(s) never recovered on the same cookie, so` +
            ` not every 401 is explicable as a shed verification hop — this needs a cause, not a guess.`,
      );
      console.log(`             first rejection seen: ${rejectSample || 'n/a'} | set-cookie: ${rejectSetCookie}`);
    }
    // The card's negative scenario expects 429 interference once per-user load exceeds the M2-06 budget of
    // 120 req/min (2 rps). Zero 429s while asking for more than 2 rps/user is therefore NOT a clean bill of
    // health — say which of the two explanations is on the table instead of letting silence read as a pass.
    if (countOf('429') === 0 && options.targetRps / options.users > 2) {
      console.log(
        `LIMITER      per-user offered rate ${(options.targetRps / options.users).toFixed(2)} rps exceeds the` +
          ` 120 req/min budget, yet 429=0. That is not evidence the budget held: the route verifies the session` +
          ` BEFORE counting it, so anything rejected upstream never reaches the limiter. Read the AUTH line.` +
          ` If auth were clean, this line would be the finding — a budget that should have bitten and did not.`,
      );
    }
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

    // A verdict that names the target rate when the client never offered it is a lie of phrasing, not of
    // arithmetic: the first baseline printed "MISS … at 50 rps" for a run that offered 13 rps because the
    // driver spent 72% of its ticks at the in-flight cap. So the target is only claimed when it was delivered.
    const offeredRps = offered / elapsedS;
    const offeredEnough = offeredRps >= options.targetRps * 0.9;
    const verdictOK = accepted.length > 0 && Number.isFinite(p95) && p95 < LATENCY_BUDGET_MS;
    const verdictWord = !offeredEnough
      ? 'INCONCLUSIVE'
      : accepted.length === 0
        ? 'MISS'
        : verdictOK
          ? 'PASS'
          : 'MISS';
    console.log(
      `VERDICT      ${verdictWord} — p95 ${fmt(p95)} ms vs the documented ${LATENCY_BUDGET_MS} ms ` +
        `at ${offeredEnough ? `${options.targetRps} rps` : `an offered ${offeredRps.toFixed(1)} rps, ` +
          `NOT the ${options.targetRps} rps the budget is written against`}. ` +
        `The budget is a product goal; this script does not edit it.`,
    );
    if (!verdictOK) {
      console.log(
        `             ${verdictWord === 'INCONCLUSIVE' ? 'An INCONCLUSIVE verdict is the harness refusing' : 'A MISS is the harness working'}` +
          ` to name a rate it did not deliver: raise --max-inflight (backpressure_ticks=` +
          `${backpressureTicks}) until offered ≈ target before any PASS/MISS is read as a latency answer.` +
          ` Closing a real gap is #92's job, not this file's.` +
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
