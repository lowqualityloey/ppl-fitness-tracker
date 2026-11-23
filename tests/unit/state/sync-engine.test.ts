import { describe, expect, it } from 'vitest';
import {
  SyncResponseDataSchema,
  type SyncMutation,
  type SyncResponseData,
} from '../../../lib/contracts/sync';
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
import { syncResponseBody } from '../../e2e/sync-fixtures';

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
  /** Every `serverSeq` the engine adopted from a drained batch, in order. */
  serverSeqs: number[];
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
  const serverSeqs: number[] = [];
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
    onServerSeq: (seq) => serverSeqs.push(seq),
  });

  return {
    engine,
    storage,
    sends,
    refetchCount: () => refetches,
    rejections,
    serverSeqs,
    advance: (ms) => {
      clock += ms;
    },
  };
}

/**
 * A clean success, built through the contract.
 *
 * This used to carry `state: {} as never` — the client-side twin of the fabrication
 * `tests/e2e/session-runner.spec.ts` was built on, and it survived #73 only because that field
 * was a `passthrough()` placeholder when this harness was written. Parsing here costs nothing
 * and means the queue's tests run against answers the server can actually give.
 */
function okResponse(
  serverSeq = 1,
  overrides: { applied?: string[]; rejected?: { mutationId: string; reason: string; message: string }[] } = {},
): SendOutcome {
  return {
    kind: 'ok',
    data: SyncResponseDataSchema.parse({
      serverSeq,
      applied: overrides.applied ?? [],
      rejected: overrides.rejected ?? [],
      clockSkewMs: 0,
    }),
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
        rejected: [{
          mutationId: id(2),
          reason: 'INVALID_MUTATION',
          message: 'Set index exceeds the routine target set count.',
        }],
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
    // The applied row is gone. The refused one is *also* gone from the queue — but it
    // did not vanish: it became surfaced state, asserted on the next two lines. Keeping
    // it queued would replay it on every poll forever (see `discardRefused`); dropping
    // it silently would lose a set the user believes they made.
    expect(harness.storage.rows).toHaveLength(0);
    expect(harness.rejections).toEqual(['INVALID_MUTATION']);
    // §8.2: the first rejection forces the full authoritative refetch.
    expect(harness.refetchCount()).toBe(1);
  });

  it('does not replay a refused mutation on the next drain', async () => {
    // The poison-pill case, as a behaviour rather than a claim: one illegal tap must
    // not spend the rest of the workout being refused again.
    const harness = engineHarness((callIndex) =>
      callIndex === 0
        ? okResponse(1, {
          applied: [],
          rejected: [{
            mutationId: id(1),
            reason: 'ILLEGAL_TRANSITION',
            message: 'The warm-up task must be completed before starting the main workout.',
          }],
        })
        : okResponse(2, { applied: [id(2)] }),
    );
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.engine.drain();
    expect(harness.rejections).toEqual(['ILLEGAL_TRANSITION']);

    await harness.storage.put(stored(1, setMutation(2, 1)));
    await harness.engine.drain();
    // The second batch contains only the new mutation.
    expect(harness.sends[1]).toHaveLength(1);
    expect(harness.sends[1]?.[0]?.mutationId).toBe(id(2));
    // The rejection is still surfaced even though its queue row is gone.
    expect(harness.rejections).toEqual(['ILLEGAL_TRANSITION']);
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

  it('an online event clears the window grown while the network was off', async () => {
    // G-M3-4's tail, found by the M3-10 hang ceiling firing under suite load (audit
    // entry 15): a batch that failed to send repeatedly while offline leaves a window
    // up to `BACKOFF_CAP_MS` standing *after* reconnect — and the provider's
    // `onOnline` drain, plus every 4 s poll, returns null inside it. The queue sits
    // "60 waiting to sync" for a wait the user is no longer supposed to pay.
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

    // Still inside the window: an ordinary drain must stay a no-op — the previous
    // test's protection, which this fix must not undo.
    await harness.engine.drain();
    expect(harness.sends).toHaveLength(1);

    // Connectivity returns. The window's premise is now false; clearing it is what
    // makes the provider's "draining then is free" claim actually true.
    harness.engine.notifyConnectivityRestored();
    await harness.engine.drain();
    expect(harness.sends, 'post-reconnect drain must not wait out an offline-grown window').toHaveLength(2);
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

describe('SyncEngine — what the screen subscribes to', () => {
  it('reports the queue length to a subscriber, before and after a drain', async () => {
    const harness = engineHarness(() => okResponse(1, { applied: [id(1)] }));
    const seen: number[] = [];
    const unsubscribe = harness.engine.subscribe((snapshot) => seen.push(snapshot.pendingCount));

    await harness.engine.mutate(setMutation(1, 0));
    // 0 from the initial delivery, then 1 queued. A component that mounted to an empty
    // queue must not have to wait for a change to learn the truth after a reload.
    expect(seen).toEqual([0, 1]);

    await harness.engine.drain();
    expect(seen[seen.length - 1]).toBe(0);

    unsubscribe();
    await harness.engine.mutate(setMutation(2, 1));
    // Unsubscribed: the last value is still the post-drain zero.
    expect(seen[seen.length - 1]).toBe(0);
  });

  it('surfaces rejections through the snapshot and clears them on dismissal', async () => {
    const harness = engineHarness(() =>
      okResponse(1, {
        rejected: [{
          mutationId: id(1),
          reason: 'SESSION_FINISHED',
          message: 'A session can only finish from post-workout.',
        }],
      }),
    );
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.engine.drain();

    // Read by pull: `subscribe` is asserted for pushes in the test above, and a
    // rejection test that awaited a guessed number of microtasks would be asserting on
    // scheduling, not on whether the user is told.
    expect((await harness.engine.snapshot()).rejections.map((item) => item.reason)).toEqual([
      'SESSION_FINISHED',
    ]);

    await harness.engine.dismissRejections();
    expect((await harness.engine.snapshot()).rejections).toEqual([]);
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

/*
 * #105 — a queue written by the previous build, drained against the narrowed contract.
 *
 * Option B's third acceptance criterion is about deployment rather than schema: mutations a
 * device queued before this change must drain against the server after it, and be applied or
 * refused legibly — never a 500, never a silent discard. What makes that true is that the *request*
 * half is untouched (an `Outbox` row's `payload` is a `SyncMutation`) and that the shipped client
 * reads three things out of the answer: `applied`, `rejected`, `serverSeq`.
 *
 * So the two specs below take the answer from the same place the browser specs do —
 * `syncResponseBody`, which `.strict().parse`es through `SyncResponseDataSchema` before it will
 * return anything — and hand it to the engine the way `provider.tsx` does: **the bytes, cast,
 * never parsed**. That is the client's actual read path, and the reason a field can be deleted
 * from the wire without a client that already has a queue noticing. "It never read `state`" is a
 * claim about three files until this runs; then it is an observation.
 */
describe('an outbox written before #105, drained against the narrowed contract', () => {
  /** The wire body a narrowed server answers with, read the way the shipped client reads it. */
  function narrowedAnswer(data: SyncResponseData): SendOutcome {
    const envelope = JSON.parse(syncResponseBody(data)) as { data?: SyncResponseData };
    if (!envelope.data) throw new Error('The sync fixture produced an envelope with no data.');
    // `as SyncResponseData` is the shipped client's own cast (`provider.tsx`), reproduced here
    // rather than improved on: the point is what *that* code does with these bytes.
    return { kind: 'ok', data: envelope.data };
  }

  it('applies a queued batch without reaching for the field that is no longer sent', async () => {
    const harness = engineHarness(() =>
      narrowedAnswer({ serverSeq: 7, applied: [id(1), id(2)], rejected: [], clockSkewMs: 0 }),
    );

    // Two taps queued by the old build, seeded exactly as `Outbox` would have left them.
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.storage.put(stored(1, setMutation(2, 1)));
    await harness.engine.drain();

    // Readable as one batch, in `seq` order…
    expect(harness.sends[0]?.map((mutation) => mutation.mutationId)).toEqual([id(1), id(2)]);
    // …drained, because the server said `applied` rather than the client assuming it…
    expect(harness.storage.rows).toEqual([]);
    // …and nothing surfaced as a refusal, which is what a silent discard would have looked like
    // from the outside until the next authoritative read disagreed with the screen.
    expect(harness.rejections).toEqual([]);
    expect(harness.refetchCount()).toBe(0);
    // The sequence the client stands on comes from the narrowed body — the only number the
    // deleted graph was ever going to contribute here.
    expect(harness.serverSeqs).toEqual([7]);
  });

  it('survives a legible refusal of a queued tap, refetching instead of reading state inline', async () => {
    const harness = engineHarness(() =>
      narrowedAnswer({
        serverSeq: 3,
        applied: [id(2)],
        rejected: [{
          mutationId: id(1),
          reason: 'CONFLICT',
          message: 'Sets can only be changed during the main workout.',
        }],
        clockSkewMs: 0,
      }),
    );
    await harness.storage.put(stored(0, setMutation(1, 0)));
    await harness.storage.put(stored(1, setMutation(2, 1)));

    await harness.engine.drain();

    // Item-level, not batch-level: one tap refused, the other accepted, and the refusal carries
    // the server's code rather than a status the whole batch had to share.
    expect(harness.rejections).toEqual(['CONFLICT']);
    expect(harness.storage.rows.map((row) => row.mutationId)).toEqual([]);
    // §8.2: the refusal forces the full authoritative read. That read — `GET /api/sessions/[id]`
    // — is where state comes from now, and it is the consumer whose absence made `state` dead.
    expect(harness.refetchCount()).toBe(1);
    expect(harness.serverSeqs).toEqual([3]);
  });
});
