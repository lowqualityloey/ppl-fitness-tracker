import { reportError } from '../../../lib/errors/reporter';
import type { SyncMutation } from '../../../lib/contracts/sync';

/**
 * M3-05 (#62): the durable client queue. This is the milestone's risk centre, so
 * it is written as a plain object with two injected dependencies and no DOM
 * reference — the whole point being that every invariant in RFC §4.3 can be
 * exercised in a unit test without a browser, a fake timer, or a running server.
 *
 * The deletion test: if this module disappears, every caller (the runner's tap
 * handler, the poller, the reconciliation) must reimplement durability,
 * idempotency-key lifetime, ordering, and backoff state. It fails; the module
 * earns its keep.
 */

/**
 * One queued mutation, exactly the §4.3 shape:
 *
 * ```ts
 * { mutationId, sessionId, seq, payload, attempt, createdAt }
 * ```
 *
 * `createdAt` is for diagnosis only and is **never** a tiebreaker — `seq` is the
 * order, because a device clock can move backwards and a queue that sorts by wall
 * time reorders itself on an NTP correction.
 */
export interface StoredMutation {
  /** Generated once at enqueue; the server's idempotency key, reused on every retry. */
  mutationId: string;
  sessionId: string;
  /** Per-session client order, monotonic, assigned under the enqueue lock. */
  seq: number;
  /** Exactly what `POST /api/sync` accepts — validated at the boundary by the caller. */
  payload: SyncMutation;
  /** For backoff only. Never read to decide correctness. */
  attempt: number;
  /** ms epoch, display and diagnosis only. */
  createdAt: number;
}

/**
 * The storage seam. `IndexedDBOutboxStorage` implements it for the browser; tests
 * implement it in memory. Deliberately shaped as async key/value over a single
 * ordered list, because that is the *weakest* interface the invariants need: the
 * outbox must not depend on a database having transactions in order to be correct.
 */
export interface OutboxStorage {
  put(mutation: StoredMutation): Promise<void>;
  /** Removes by id. Absent ids are not an error (a retry after a lost response). */
  delete(mutationIds: readonly string[]): Promise<void>;
  /** The whole queue for one session, oldest `seq` first. */
  list(sessionId: string): Promise<StoredMutation[]>;
  /**
   * The highest `seq` already stored for this session, or -1 when the queue is empty.
   *
   * `enqueue` used to compute this with `list()`, which read and deserialized **every
   * queued row** on each tap. The number it produces is the same, so the difference is
   * invisible to correctness and very visible to latency: the tap path is the one this
   * slice's 50 ms gate measures, and an outbox that costs O(queue depth) per tap gets
   * slower as the connection stays bad. An implementation is expected to answer this
   * without materializing the rows.
   */
  lastSeq(sessionId: string): Promise<number>;
  /** Bumps `attempt` without touching anything else. */
  updateAttempt(mutationId: string, attempt: number): Promise<void>;
}

export interface OutboxDeps {
  storage: OutboxStorage;
  /** Injected so tests can pin time; nothing here reads `Date.now()` directly. */
  now: () => number;
  /** Injected so a test can assert ids are stable without mocking crypto. */
  newId: () => string;
}

/**
 * Storage refused to persist — the device is out of quota, or private browsing
 * has removed the store. This is **not** a transient failure and must never be
 * retried into the same full disk: the caller degrades to "online only" and says
 * so (card task 4). Typed rather than a magic string so a caller cannot mistake it
 * for a network error and queue the tap anyway.
 */
export class OutboxQuotaExceededError extends Error {
  constructor(public readonly cause?: unknown) {
    super('The offline queue could not be written: device storage is full or unavailable.');
    this.name = 'OutboxQuotaExceededError';
  }
}

/**
 * A queue for exactly one session.
 *
 * Per-session rather than global because RFC §4.3 pairs per-session FIFO with
 * *cross-session unconstrained*, and because the sync contract itself refuses a
 * batch spanning two sessions (`SyncRequestSchema`'s `superRefine`). A single
 * global queue would still have to partition by session before sending — doing it
 * at construction makes that partition structural instead of remembered.
 *
 * `enqueue` never invents an id: the caller supplies the fully-formed payload
 * (including `mutationId`), because the id must exist *before* the UI can optimistically
 * render and before anything can be retried. Ids generated inside a retry loop are
 * how a lost response becomes a duplicate set.
 */
export class Outbox {
  private readonly storage: OutboxStorage;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(
    public readonly sessionId: string,
    deps: OutboxDeps,
  ) {
    this.storage = deps.storage;
    this.now = deps.now;
    this.newId = deps.newId;
  }

  /**
   * Assign a `mutationId` at enqueue time, as §4.3 requires.
   *
   * Split from `enqueue` so a caller that must render optimistically *before*
   * awaiting IndexedDB has an id to render — while `enqueue` remains the only way
   * to make the mutation durable. The promise a tap resolves on is `enqueue`'s,
   * never this one's.
   */
  nextMutationId(): string {
    return this.newId();
  }

  /**
   * Append one mutation and resolve only once storage holds it.
   *
   * This is §4.3's "durable before acknowledged": the caller may paint the set as
   * saved in anticipation, but the *promise it awaits* is this one. A quota failure
   * rejects loudly instead of being swallowed, because a tap that silently vanished
   * is the exact defect this module exists to prevent.
   */
  async enqueue(payload: SyncMutation): Promise<StoredMutation> {
    const seq = (await this.storage.lastSeq(this.sessionId)) + 1;

    const stored: StoredMutation = {
      mutationId: payload.mutationId,
      sessionId: this.sessionId,
      seq,
      payload,
      attempt: 0,
      createdAt: this.now(),
    };

    try {
      await this.storage.put(stored);
    } catch (error) {
      // M4-06 (#95) — "the `Outbox` quota errors are typed already — report, don't
      // swallow". Typed is not the same as *seen*: this rejection is loud inside the
      // module and becomes a banner the owner never reads, on a device that will quietly
      // lose the next fifty taps the same way. Reported at the origin rather than at
      // `SyncEngine.mutate`, because every caller of `enqueue` gets the fact and the
      // reporter's once-per-object rule makes a second report from a wrapper pointless.
      // Then rethrown untouched: a channel that swallowed the rejection would trade a
      // lost mutation for a silent one, which is the defect §4.3 exists to prevent.
      reportError(error, {
        plane: 'client',
        kind: 'durability',
        source: 'outbox:enqueue',
        attributes: {
          sessionId: this.sessionId,
          mutationId: stored.mutationId,
          seq: stored.seq,
        },
      });
      throw new OutboxQuotaExceededError(error);
    }

    return stored;
  }

  /** The next batch to send: oldest first, capped at the contract's 200. */
  async peek(limit = 200): Promise<StoredMutation[]> {
    const queued = await this.storage.list(this.sessionId);
    return queued.slice(0, limit);
  }

  /**
   * Forget mutations the server acknowledged — and only those.
   *
   * Takes the applied ids explicitly rather than clearing the batch, because a
   * batch can be partially applied (§4.3, §8.2). Clearing on "the request
   * succeeded" would discard a mutation the server explicitly refused, which is how
   * a rejected set disappears from the queue without ever surfacing to the user.
   */
  async markApplied(mutationIds: readonly string[]): Promise<void> {
    if (mutationIds.length === 0) return;
    await this.storage.delete(mutationIds);
  }

  /**
   * Forget mutations the server **refused**, as distinct from the ones it acknowledged.
   *
   * Both delete rows, and it would be tempting to reuse `markApplied`. Resisting that
   * is the point: they mean opposite things, and conflating them loses the one signal
   * the user needs. An applied mutation is a success story that no longer needs
   * mentioning; a refused one must be remembered as visible state precisely because it
   * is the case where what the user tapped is not what happened.
   *
   * Why they leave the queue at all: §4.3 says rejections "surface, never vanish", and
   * the naive reading is to keep the row. But a rejected mutation is one the server has
   * authoritatively refused — keeping it means the next drain replays it, is refused
   * again, refetches again, forever. That is a poison pill: a workout with one illegal
   * tap would spend its remaining life re-sending a mutation that can never succeed, and
   * the user would never see the other sets land. The record survives as *state* (see
   * `SyncEngine`'s rejections), which is what "surface" is for.
   */
  async discardRefused(mutationIds: readonly string[]): Promise<void> {
    if (mutationIds.length === 0) return;
    await this.storage.delete(mutationIds);
  }

  /**
   * Record a failed attempt so backoff can grow.
   *
   * Note what this does *not* do: it never drops, reorders, or re-ids the mutation.
   * A mutation leaves this queue for exactly one reason — the server listed its id
   * in `applied[]`.
   */
  async recordAttempt(mutationId: string, attempt: number): Promise<void> {
    await this.storage.updateAttempt(mutationId, attempt);
  }

  /** How many mutations are waiting; drives the "N waiting to sync" copy (§2.2). */
  async pendingCount(): Promise<number> {
    return (await this.storage.list(this.sessionId)).length;
  }
}
