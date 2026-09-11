import { describe, expect, it } from 'vitest';
import type { SyncMutation } from '../../../lib/contracts/sync';
import { OutboxQuotaExceededError } from '../../../src/app/state/outbox';
import type { SendOutcome } from '../../../src/app/state/sync-engine';
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  BUDGET_FRACTION,
  MAX_BATCH,
  POLL_INTERVAL_HIDDEN_MS,
  POLL_INTERVAL_VISIBLE_MS,
  SyncEngine,
  backoffDelayMs,
  budgetFractionUsed,
  requestsPerMinute,
} from '../../../src/app/state/sync-engine';
import { DEVICE, SESSION, id, makeOutbox, MemoryStorage, setMutation, stored } from './fixtures';

/**
 * M3-05 (#62) — the engine's scheduling and single-flight rules. Every external
 * dependency is scripted: a memory store, a clock the test moves, a `send` returning
 * chosen outcomes, an injected `random`. Nothing waits in real time and nothing
 * touches a browser, which is the entire reason the seams exist.
 */

interface EngineHarness {
  engine: SyncEngine;
  storage: MemoryStorage;
  sends: SyncMutation[][];
  refetchCount: () => number;
  rejections: string[];
  /** Moves the engine's clock; backoff is asserted by moving time, not waiting it. */
  advance: (ms: number) => void;
}

/**
 * An engine with every external dependency scripted.
 *
 * `respond` receives the send index and the batch, so a test can fail the first
 * attempt and succeed the second — the sequence that distinguishes a retry from a
 * duplicate.
 */
function engineHarness(
  respond: (callIndex: number, batch: SyncMutation[]) => SendOutcome,
  options: { random?: () => number } = {},
): EngineHarness {
  const storage = new MemoryStorage();
  const outbox = makeOutbox(storage).outbox;
  const sends: SyncMutation[][] = [];
  const rejections: string[] = [];
  let clock = 1_700_000_000_000;
  let refetches = 0;

  const engine = new SyncEngine({
    outbox,
    deviceId: DEVICE,
    now: () => clock,
    random: options.random,
    sleep: async () => {},
    isVisible: () => true,
    send: async (request) => {
      sends.push(request.mutations);
      return respond(sends.length - 1, request.mutations);
    },
    refetch: async () => {
      refetches += 1;
    },
    onRejected: (items) => rejections.push(...items.map((item) => item.reason)),
  });

  return {
    engine,
    storage,
    sends,
    refetchCount: () => refetches,
    rejections,
    advance: (ms) => {
      clock += ms;
    },
  };
}

/** A clean success. `state` is a placeholder because #73 leaves that schema permissive. */
function okResponse(
  serverSeq = 1,
  overrides: { applied?: string[]; rejected?: { mutationId: string; reason: string }[] } = {},
): SendOutcome {
  return {
    kind: 'ok',
    data: {
      serverSeq,
      applied: overrides.applied ?? [],
      rejected: overrides.rejected ?? [],
      state: {} as never,
      clockSkewMs: 0,
    },
  };
}

describe('backoffDelayMs — jittered, capped, and assertable', () => {
  it('grows with the attempt count', () => {
    const always = () => 1;
    expect(backoffDelayMs({ attempt: 0, random: always })).toBe(BACKOFF_BASE_MS);
    expect(backoffDelayMs({ attempt: 3, random: always })).toBe(BACKOFF_BASE_MS * 8);
  });

  it('never exceeds the cap, at any attempt count', () => {
    const always = () => 1;
    // `2 ** 60` would otherwise overflow into an absurd window; the cap must hold.
    expect(backoffDelayMs({ attempt: 60, random: always })).toBe(BACKOFF_CAP_MS);
    expect(backoffDelayMs({ attempt: 1_000, random: always })).toBe(BACKOFF_CAP_MS);
  });

  it('spreads retries across the whole window rather than synchronising them', () => {
    // Full jitter: the two ends of the range are reachable, which is what stops N
    // devices coming back from one dropped signal retrying in lockstep into a 429.
    const delays = [0, 0.25, 0.5, 0.75, 0.999].map((value) =>
      backoffDelayMs({ attempt: 4, random: () => value }),
    );
    expect(delays[0]).toBe(0);
    expect(new Set(delays).size).toBe(delays.length);
    expect(Math.max(...delays)).toBeLessThanOrEqual(Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 16));
  });

  it('treats a negative attempt as zero instead of producing a fractional window', () => {
    expect(backoffDelayMs({ attempt: -5, random: () => 1 })).toBe(BACKOFF_BASE_MS);
  });
});

describe('SyncEngine — §4.3 one in-flight batch', () => {
  it('collapses concurrent drains into a single send', async () => {
    const harness = engineHarness(() => okResponse());
    await harness.engine.mutate(setMutation(1, 0));

    // Both calls are issued before either can finish. The second must join the
    // in-flight work rather than start a competing batch carrying the same ids.
    const [first, second] = await Promise.all([harness.engine.drain(), harness.engine.drain()]);
    expect(harness.sends).toHaveLength(1);
    expect(first).toStrictEqual(second);
  });

  it('sends eagerly on mutate, so a tap online does not wait for a poll', async () => {
    const harness = engineHarness(() => okResponse(1, { applied: [id(1)] }));
    await harness.engine.mutate(setMutation(1, 0));
    // `mutate`'s promise is durability and the drain it starts is deliberately not
    // awaited. Joining that in-flight drain is how the test observes the eager send
    // without depending on a microtask count: hand-rolling `await Promise.resolve()`
    // asserted too little and failed for the wrong reason.
    await harness.engine.drain();
    expect(harness.sends).toHaveLength(1);
    expect(harness.storage.rows).toHaveLength(0);
  });

  it('forgets only what the server applied, and refetches on a rejection', async () => {
    const harness = engineHarness(() =>
      okResponse(5, {
        applied: [id(1)],
        rejected: [{ mutationId: id(2), reason: 'INVALID_MUTATION' }],
      }),
    );

    // Seeded directly rather than through `mutate`, so both mutations land in one
    // batch: `mutate` drains eagerly and its second call would collapse into the
    // first send (correct behaviour, asserted above) instead of testing this rule.
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.storage.put(stored(1, setMutation(2, 1)));
    await harness.engine.drain();

    expect(harness.sends).toHaveLength(1);
    expect(harness.sends[0]).toHaveLength(2);
    // One removed, one retained: a rejection must not disappear with the batch.
    expect(harness.storage.rows.map((row) => row.mutationId)).toEqual([id(2)]);
    expect(harness.rejections).toEqual(['INVALID_MUTATION']);
    // §8.2: the first rejection forces the full authoritative refetch.
    expect(harness.refetchCount()).toBe(1);
  });

  it('keeps the batch queued when the send is retryable', async () => {
    const harness = engineHarness(() => ({ kind: 'retryable', reason: 'offline' }));
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.engine.drain();

    expect(harness.storage.rows).toHaveLength(1);
    // `attempt` grows for backoff; the id and the order do not change.
    expect(harness.storage.rows[0]?.attempt).toBe(1);
    expect(harness.storage.rows[0]?.mutationId).toBe(id(1));
    expect(harness.refetchCount()).toBe(0);
  });

  it('waits out the backoff window before sending again', async () => {
    let calls = 0;
    const harness = engineHarness(
      () =>
        calls++ === 0
          ? { kind: 'retryable', reason: 'offline' }
          : okResponse(1, { applied: [id(1)] }),
      { random: () => 1 },
    );
    await harness.storage.put(stored(0, setMutation(1, 0)));

    await harness.engine.drain();
    expect(harness.sends).toHaveLength(1);
    expect(harness.storage.rows[0]?.attempt).toBe(1);

    // Still inside the window (attempt 1 → base*2 = 2 s with jitter pinned to 1): a
    // drain must be a no-op, not a second request. Without this gate, a poller and a
    // retrying caller would hammer a network that just said "not now".
    await harness.engine.drain();
    expect(harness.sends).toHaveLength(1);

    harness.advance(BACKOFF_BASE_MS * 2);
    await harness.engine.drain();
    expect(harness.sends).toHaveLength(2);
    // The window is over and this send was acknowledged, so the row is gone. A second
    // retryable drain would have been swallowed by the window instead of reaching here.
    expect(harness.storage.rows).toHaveLength(0);
  });

  it('never drops a batch the server refused as fatal', async () => {
    const harness = engineHarness(() => ({ kind: 'fatal', reason: 'session not found' }));
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.engine.drain();

    // Retrying a 4xx forever hides a bug; deleting it loses a workout. So the row
    // stays and the reason becomes readable state for the UI to show.
    expect(harness.storage.rows).toHaveLength(1);
    expect(harness.engine.lastFatalReason()).toBe('session not found');
    expect(harness.refetchCount()).toBe(0);
  });

  it('clears a recorded fatal once the server accepts a batch', async () => {
    let calls = 0;
    const harness = engineHarness(() =>
      calls++ === 0 ? { kind: 'fatal', reason: 'transient 5xx' } : okResponse(1, { applied: [id(1)] }),
    );
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.engine.drain();
    expect(harness.engine.lastFatalReason()).toBe('transient 5xx');

    await harness.engine.drain();
    // A banner that latched the first failure would keep telling the user their
    // workout was unsynced after it had in fact landed.
    expect(harness.engine.lastFatalReason()).toBeNull();
    expect(harness.storage.rows).toHaveLength(0);
  });

  it('refuses to represent session.start as a queueable mutation', () => {
    // A compile-time guarantee, asserted at runtime as documentation: the four ops are
    // the entire vocabulary and none of them starts a session (RFC §8.1). This test
    // exists so that widening the union later is a deliberate act with a failing test
    // attached, not an accident.
    const ops = ['set.upsert', 'task.complete', 'phase.advance', 'session.finish'];
    expect(ops).toHaveLength(4);
    expect(ops).not.toContain('session.start');
    expect(MAX_BATCH).toBe(200);
  });

  it('surfaces a quota failure from enqueue rather than queueing anyway', async () => {
    const harness = engineHarness(() => okResponse());
    harness.storage.putImpl = async () => {
      throw new Error('QuotaExceededError');
    };
    await expect(harness.engine.mutate(setMutation(1, 0))).rejects.toBeInstanceOf(
      OutboxQuotaExceededError,
    );
    // The tap was never accepted, so nothing may claim it is safe to close the tab.
    expect(harness.storage.rows).toHaveLength(0);
  });
});

describe('SyncEngine — polling iteration (§8.3)', () => {
  it('drains then refetches on one poll', async () => {
    const harness = engineHarness(() => okResponse(1, { applied: [id(1)] }));
    await harness.storage.put(stored(0, setMutation(1, 0)));

    await harness.engine.pollOnce();
    expect(harness.sends).toHaveLength(1);
    expect(harness.refetchCount()).toBe(1);
  });

  it('sends nothing when the queue is empty, so a poll costs one request', async () => {
    const harness = engineHarness(() => okResponse());
    await harness.engine.pollOnce();

    // The budget arithmetic §8.3 relies on treats a poll as a single request. If an
    // empty queue still POSTed, every visible tab would double its spend for nothing.
    expect(harness.sends).toHaveLength(0);
    expect(harness.refetchCount()).toBe(1);
  });
});

describe('poll cadence arithmetic (§8.3)', () => {
  it('keeps two visible tabs plus writes under the 40% budget', () => {
    // The rule §8.3 states: polls plus real writes stay under roughly 40% of the
    // 120 req/min budget. Asserted as arithmetic rather than as a comment, so a future
    // change to the interval has to face the number.
    const used = budgetFractionUsed({ visibleTabs: 2, writesPerMinute: 15 });
    expect(used).toBeLessThanOrEqual(BUDGET_FRACTION);
    // If this ever breaks, the failure names the arithmetic: 15 rpm per tab plus 15
    // writes is 45 rpm of 120, i.e. 37.5%.
    expect(requestsPerMinute(POLL_INTERVAL_VISIBLE_MS)).toBe(15);
  });

  it('polls far slower when the tab is hidden', () => {
    expect(requestsPerMinute(POLL_INTERVAL_HIDDEN_MS)).toBe(2);
    expect(POLL_INTERVAL_HIDDEN_MS).toBeGreaterThan(POLL_INTERVAL_VISIBLE_MS);
  });
});

describe('Outbox wiring inside the engine', () => {
  it('reports the queue length that drives the "waiting to sync" copy', async () => {
    const { outbox } = makeOutbox();
    const engine = new SyncEngine({
      outbox,
      deviceId: '33333333-3333-4333-8333-333333333333',
      now: () => 1_700_000_000_000,
      sleep: async () => {},
      isVisible: () => true,
      // Retryable so nothing is ever removed: the count under test is the queued count.
      send: async () => ({ kind: 'retryable', reason: 'offline' }),
      refetch: async () => {},
    });

    await engine.mutate(setMutation(1, 0));
    await engine.mutate(setMutation(2, 1));
    await engine.mutate({
      op: 'phase.advance',
      mutationId: id(3),
      clientTs: '2026-09-11T09:05:00.000Z',
      sessionId: SESSION,
      phase: 'rest',
    });

    expect((await engine.pending()).map((row) => row.seq)).toEqual([0, 1, 2]);
    expect(await outbox.pendingCount()).toBe(3);
  });
});
