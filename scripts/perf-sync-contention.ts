#!/usr/bin/env node
/**
 * M4-02 (#91) — batch contention driver.
 *
 * What this answers: G-M3-4's 5 s budget was measured with ONE client applying a
 * 60-mutation batch on an idle box. The RFC condition is a *concurrent* client. This
 * script creates that condition: a pair of clients draining overlapping 60-mutation
 * batches while a background stream of single-mutation syncs keeps the pool, the
 * per-session locks, and GoTrue validation busy. The 5 s figure itself lives in
 * tests/e2e/sla.spec.ts and is NOT redeclared as a tunable here — the flag exists so
 * the control run (scripts/perf/batch-contention-control.sh) can prove the instrument
 * detects a breach; measurement never moves the budget.
 *
 * Two classes of load, and exactly one class is judged:
 *   * BATCH clients — the measured subject. Their request latency is the 60-mutation
 *     apply under contention, compared against the 5 s budget.
 *   * BG (background) clients — the load generator. Their latencies are reported for
 *     attribution ("what did the batches cost the bystanders") and are never compared
 *     to the batch budget. Mixing the two distributions is how a benchmark becomes a
 *     lie: the #90 harness learned the accepted-only-percentile lesson the hard way.
 *
 * The batch shape follows tests/e2e/sync-latency.spec.ts (its clientTs lesson, lines
 * 105-117): each mutation carries its own timestamp, 1 ms apart. A constant clientTs
 * across 60 re-ticks of three slots makes compareEntityVersions break ties on a random
 * mutationId — half the batch would reject as STALE_CONFLICT and the distribution would
 * measure the rejection path, not the apply path. setIndex cycles 0..2 because the
 * seeded routine plans exactly 3 sets (M2-04 rejects anything beyond the plan).
 *
 * Per-user request rate stays under the sync route's limiter so a 429 never masquerades
 * as load: batch ticks are --batch-interval-ms (default 1500 ms = 0.67 rps) and BG is
 * paced per user (default 1.25 rps). The #125 finding (401 epidemics under GoTrue
 * pressure at high concurrency) is why intensity is user-tunable and defaults modest.
 *
 * Run through the npm script so .env.local reaches the process:
 *   npm run perf:contention -- --duration=45 --label=contended
 * Exit code: 0 when batch p95 is inside the budget, 1 when it misses (with the numbers
 * printed either way — the measurement is the product, the exit code is the verdict).
 */
import { randomUUID } from 'node:crypto';
import { cpus, loadavg } from 'node:os';
import {
  authHeaders,
  createTestSession,
  seedSessionFixtures,
  type SessionFixture,
  type TestSession,
} from '../tests/integration/api/fixtures';

/** The seeded routine plans 3 sets; M2-04 rejects a setIndex beyond the plan. */
const LEGAL_SET_SLOTS = 3;

const REQUIRED_FLAGS = ['duration'] as const;

interface Options {
  baseUrl: string;
  durationS: number;
  batchUsers: number;
  batchSize: number;
  batchIntervalMs: number;
  bgUsers: number;
  bgRpsPerUser: number;
  /** Default: G-M3-4's budget. A flag, not a constant, ONLY so the control can prove
   * the instrument detects a breach; nothing here edits the spec's budget. */
  budgetMs: number;
  label: string;
}

function parseArgs(argv: string[]): Options {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i] ?? '');
    if (!match) throw new Error(`unrecognized argument: ${argv[i]}`);
    raw.set(match[1]!, match[2] ?? argv[i + 1] ?? '');
    if (match[2] === undefined) i += 1;
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!raw.has(flag)) throw new Error(`--${flag} is required`);
  }
  const num = (name: string, fallback: number): number => {
    const value = raw.get(name);
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number, got "${value}"`);
    return parsed;
  };
  return {
    baseUrl: raw.get('base-url') || process.env.PERF_BASE_URL || 'http://localhost:3001',
    durationS: num('duration', 45),
    batchUsers: num('batch-users', 2),
    batchSize: num('batch-size', 60),
    batchIntervalMs: num('batch-interval-ms', 1500),
    bgUsers: num('bg-users', 8),
    bgRpsPerUser: num('bg-rps-per-user', 1.25),
    budgetMs: num('budget-ms', 5000),
    label: raw.get('label') || 'contention',
  };
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index]!;
}

interface Outcome {
  ok: boolean;
  status: number;
  /** Full round-trip latency for accepted (status-200) responses only. */
  acceptedMs: number[];
  byStatus: Map<number, number>;
  /** Applied mutations across accepted responses / mutations offered in them. */
  applied: number;
  rejected: number;
  offeredMutations: number;
}

function newOutcome(): Outcome {
  return {
    ok: true,
    status: 200,
    acceptedMs: [],
    byStatus: new Map(),
    applied: 0,
    rejected: 0,
    offeredMutations: 0,
  };
}

/**
 * setIndex cycles three legal slots; weight varies so consecutive writes are not
 * byte-identical payloads replaying the same mutationId. `since` advances with the
 * serverSeq the response carries, so no delta payload bloat mid-run.
 */
async function postSync(
  base: string,
  session: TestSession,
  fixture: SessionFixture,
  state: { sinceSeq: number },
  seq: number,
  count: number,
): Promise<{ latencyMs: number; status: number; applied: number; rejected: number }> {
  const firstTs = Date.now();
  const body = {
    deviceId: fixture.ids.device,
    sinceSeq: state.sinceSeq,
    mutations: Array.from({ length: count }, (_, index) => ({
      op: 'set.upsert' as const,
      mutationId: randomUUID(),
      clientTs: new Date(firstTs + index).toISOString(),
      sessionId: fixture.ids.session,
      exerciseId: fixture.ids.exercise,
      // Three legal slots, cycled — the seeded routine plans exactly 3 sets and
      // anything beyond the plan is rejected with INVALID_MUTATION.
      setIndex: (seq + index) % LEGAL_SET_SLOTS,
      isCompleted: true,
      weightKg: 60 + ((seq + index) % 10) * 2.5,
      reps: 8,
    })),
  };
  const startedAt = performance.now();
  const response = await fetch(`${base}/api/sync`, {
    method: 'POST',
    headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const latencyMs = performance.now() - startedAt;
  const status = response.status;
  const json = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    data?: { serverSeq?: number; applied?: string[]; rejected?: unknown[] };
  };
  if (json.data?.serverSeq !== undefined) state.sinceSeq = json.data.serverSeq;
  return {
    latencyMs,
    status,
    applied: json.data?.applied?.length ?? 0,
    rejected: json.data?.rejected?.length ?? 0,
  };
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  // The measurement clock starts AFTER the fixture users exist — minting 10 GoTrue
  // users and seeding their rows eats ~4 s, and a deadline computed before that
  // quietly shortened every --duration (the first #91 run's wallS 40.6 vs nominal 45
  // is exactly this bug; the fix makes wall the honest denominator).

  const batchClients: Array<{ session: TestSession; fixture: SessionFixture; since: { sinceSeq: number } }> = [];
  const bgClients: typeof batchClients = [];
  const cleanups: Array<() => Promise<void>> = [];
  for (let i = 0; i < options.batchUsers + options.bgUsers; i += 1) {
    const isBatch = i < options.batchUsers;
    const session = await createTestSession(`m4-02-${isBatch ? 'batch' : 'bg'}-${i}`);
    const fixture = await seedSessionFixtures(session);
    cleanups.push(fixture.cleanup, session.cleanup);
    (isBatch ? batchClients : bgClients).push({ session, fixture, since: { sinceSeq: 0 } });
  }

  const batch = newOutcome();
  const bg = newOutcome();
  let batchIssued = 0;
  let bgIssued = 0;
  let elapsedS = 0;

  const record = (outcome: Outcome, result: { status: number; latencyMs: number; applied: number; rejected: number }, mutations: number) => {
    outcome.byStatus.set(result.status, (outcome.byStatus.get(result.status) ?? 0) + 1);
    if (result.status === 200) {
      outcome.acceptedMs.push(result.latencyMs);
      outcome.applied += result.applied;
      outcome.rejected += result.rejected;
      outcome.offeredMutations += mutations;
    } else {
      outcome.ok = false;
    }
  };

  const streams: Promise<void>[] = [];
  const runStartedAt = performance.now();
  const deadline = runStartedAt + options.durationS * 1000;
  for (const client of batchClients) {
    streams.push((async () => {
      while (performance.now() < deadline) {
        const at = performance.now();
        const result = await postSync(options.baseUrl, client.session, client.fixture, client.since, batchIssued, options.batchSize);
        record(batch, result, options.batchSize);
        batchIssued += 1;
        const waitMs = at + options.batchIntervalMs - performance.now();
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    })());
  }
  for (const client of bgClients) {
    streams.push((async () => {
      while (performance.now() < deadline) {
        const at = performance.now();
        const result = await postSync(options.baseUrl, client.session, client.fixture, client.since, bgIssued, 1);
        record(bg, result, 1);
        bgIssued += 1;
        const waitMs = at + 1000 / options.bgRpsPerUser - performance.now();
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    })());
  }
  await Promise.all(streams);
  const wallS = (performance.now() - runStartedAt) / 1000;
  elapsedS = options.durationS;

  for (const cleanup of cleanups) await cleanup().catch(() => undefined);

  const bs = [...batch.acceptedMs].sort((a, b) => a - b);
  const gs = [...bg.acceptedMs].sort((a, b) => a - b);
  const fmt = (samples: number[]): string =>
    `n=${samples.length} p50=${percentile(samples, 0.5).toFixed(1)} p95=${percentile(samples, 0.95).toFixed(1)} max=${(samples[samples.length - 1] ?? 0).toFixed(1)}`;

  console.log(`LABEL=${options.label}`);
  console.log(`HOST cores=${cpus().length} load1min=${loadavg()[0]?.toFixed(2)} nominalDurationS=${elapsedS.toFixed(1)} wallS=${wallS.toFixed(1)}`);
  console.log(
    `BATCH-OFFERED batches=${batchIssued} size=${options.batchSize} clients=${batchClients.length} ` +
    `intervalMs=${options.batchIntervalMs} ratePerUser=${(1000 / options.batchIntervalMs).toFixed(2)}rps`,
  );
  console.log(`BG-OFFERED mutations=${bgIssued} clients=${bgClients.length} ratePerUser=${options.bgRpsPerUser}rps`);
  console.log(`BATCH-ACCEPTED ${fmt(bs)} statusBreakdown=${JSON.stringify([...batch.byStatus.entries()])}`);
  console.log(
    `BATCH-APPLIED ${batch.applied}/${batch.offeredMutations} rejected=${batch.rejected} ` +
    `denominator=accepted-batch-mutations (429/401/5xx batches are in statusBreakdown, not in the applied count)`,
  );
  console.log(`BG-ACCEPTED ${fmt(gs)} statusBreakdown=${JSON.stringify([...bg.byStatus.entries()])}`);

  const p95 = percentile(bs, 0.95);
  const holds = Number.isFinite(p95) && p95 <= options.budgetMs;
  console.log(
    `VERDICT batch p95=${p95.toFixed(1)}ms vs G-M3-4 budget=${options.budgetMs}ms (read-only copy; spec constant untouched) ` +
    `=> ${holds ? 'HOLDS' : 'MISSES'} under ${batchClients.length}-batch x ${bgClients.length}-bg contention`,
  );
  return holds ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`CONTENTION-ERROR ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(2);
  });
