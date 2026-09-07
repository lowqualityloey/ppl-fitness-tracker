/**
 * Puts a number on the cost of ADR-0003.
 *
 * STATE.md §5 lists "per-request transaction cost of ADR-0003 is unmeasured" as
 * an open risk. The RLS backstop forces every request into an explicit
 * transaction with a set_config round trip, where app-layer scoping alone would
 * be a single autocommit statement. This measures that delta.
 *
 * Indicative only. One local container, no network hop, no concurrent load.
 * It bounds the per-request overhead; it is not a production SLA measurement.
 */
import { sql } from 'drizzle-orm';
import { APP_DIRECT_URL, APP_POOLER_URL, connect, withUser, type Db } from '../src/db.js';
import { sessionSets } from '../src/schema.js';
import { resetAndSeed } from '../src/setup-db.js';

const ITERATIONS = 2000;
const WARMUP = 200;

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { mean, p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

async function measure(label: string, run: () => Promise<unknown>) {
  for (let i = 0; i < WARMUP; i++) await run();
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t = performance.now();
    await run();
    samples.push(performance.now() - t);
  }
  const r = stats(samples);
  console.log(
    `${label.padEnd(46)} mean ${r.mean.toFixed(3)}ms  p50 ${r.p50.toFixed(3)}ms  ` +
      `p95 ${r.p95.toFixed(3)}ms  p99 ${r.p99.toFixed(3)}ms`,
  );
  return r;
}

const { userA } = await resetAndSeed();

async function suite(name: string, dsn: string) {
  const h = connect(dsn, 10);
  const db: Db = h.db;
  console.log(`\n--- ${name} ---`);
  const bare = await measure('SELECT, autocommit, no RLS context', () =>
    db.execute(sql`SELECT 1`),
  );
  const scoped = await measure('SELECT ... WHERE user_id = $1, autocommit', () =>
    db.execute(sql`SELECT id FROM public.session_sets WHERE user_id = ${userA.id}`),
  );
  const wrapped = await measure('withUser(): BEGIN, set_config, SELECT, COMMIT', () =>
    withUser(db, userA.claims, (tx) => tx.select().from(sessionSets)),
  );
  console.log(
    `overhead of withUser() over a bare autocommit SELECT: ` +
      `${(wrapped.p50 - bare.p50).toFixed(3)}ms p50, ${(wrapped.p95 - bare.p95).toFixed(3)}ms p95`,
  );
  console.log(
    `overhead over an app-scoped autocommit SELECT:        ` +
      `${(wrapped.p50 - scoped.p50).toFixed(3)}ms p50, ${(wrapped.p95 - scoped.p95).toFixed(3)}ms p95`,
  );
  await h.close();
}

console.log(`iterations=${ITERATIONS} warmup=${WARMUP} node=${process.version}`);
await suite('direct connection (port 54322)', APP_DIRECT_URL);
await suite('via supavisor, transaction mode (port 54329)', APP_POOLER_URL);
