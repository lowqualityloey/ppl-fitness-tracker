import type { SyncMutation, SyncResponseData } from '../../../lib/contracts/sync';
import { Outbox, type StoredMutation } from './outbox';
import { reconcile, type ReconciliationOutcome, type VisibleRejection } from './reconcile';

/**
 * M3-05 (#62): `Outbox` + reconciliation + scheduling, per RFC §3.2.
 *
 * Everything external is injected — `send`, `refetch`, `now`, `sleep`, `newId`,
 * visibility — because the interesting behaviour here is *timing and failure*, and a
 * module that reads `fetch`/`Date.now`/`document` directly can only be tested by
 * standing those up. The card asks for exactly this: contract-style unit tests
 * against an injected store and an injected clock.
 *
 * The type of `mutate` deserves a note. It accepts `SyncMutation`, which is the
 * four-op discriminated union — so **`session.start` is not merely discouraged, it
 * is unrepresentable** (RFC §8.1). Starting a workout stays on `POST /api/sessions`,
 * which is what the dashboard's `StartButton` calls. If a future change wanted to
 * queue a start, it would have to widen this type first, and that is the moment the
 * discussion is supposed to happen.
 */

export interface SyncEngineDeps {
  outbox: Outbox;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** The only network call this module makes. Must not throw for HTTP errors. */
  send: (request: {
    deviceId: string;
    sinceSeq: number;
    mutations: SyncMutation[];
  }) => Promise<SendOutcome>;
  /**
   * Full authoritative read of the session (RFC §4.3/§8.2). Called whenever the
   * server rejects anything in a batch — never a surgical rollback.
   */
  refetch: () => Promise<void>;
  deviceId: string;
  /** True when the tab is visible; the poller slows down when it is not (§8.3). */
  isVisible: () => boolean;
  /**
   * Jitter source for backoff. Optional because production wants `Math.random`, but a
   * test must be able to pin both ends of the window — an unpinnable jitter is an
   * unassertable invariant, and "backoff is jittered" would be a comment rather than a
   * control.
   */
  random?: () => number;
  onRejected?: (rejections: VisibleRejection[]) => void;
  onServerSeq?: (serverSeq: number) => void;
}

/** What `send` reports back. `retryable` distinguishes "try later" from "refused". */
/**
 * What a subscriber is told about the queue. Deliberately a plain snapshot rather than
 * an observable: the app has no RxJS dependency, and §3.2's `pending$` only ever needs
 * "how many are waiting, and what was refused" re-read on change.
 */
export interface SyncSnapshot {
  /** The queued records themselves, oldest first — what `projectPending` overlays. */
  pending: StoredMutation[];
  pendingCount: number;
  /** Age in ms of the oldest queued entry, or 0 if the queue is empty. */
  oldestAgeMs: number;
  rejections: VisibleRejection[];
  lastFatalReason: string | null;
}

export type SendOutcome =
  | { kind: 'ok'; data: SyncResponseData }
  | { kind: 'retryable'; reason: string }
  | { kind: 'fatal'; reason: string };

export const MAX_BATCH = 200;

/**
 * Backoff bounds, in milliseconds.
 *
 * Jittered (full jitter, RFC §4.3: "backoff is jittered and limiter-aware") because
 * N devices coming back from the same dropped signal must not retry in lockstep —
 * a synchronised retry storm is exactly what the 120 req/min limiter turns into 429s
 * for everyone.
 */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 30_000;

/**
 * Poll cadence, and the arithmetic that justifies it (§8.3).
 *
 * The per-user sync budget is 120 req/min. §8.3's rule is that polls *plus* real
 * writes stay under roughly 40% of it — 48 req/min — leaving room for a user
 * actually training, for a second visible tab, and for the writes themselves.
 * `POLL_INTERVAL_VISIBLE_MS` of 4 s is 15 req/min, so two visible tabs plus a
 * steady write rate fits; `HIDDEN` drops to 30 s (2 req/min) because a hidden tab
 * has no user waiting on propagation.
 *
 * These are exported *values*, not prose, so the test asserts the same arithmetic
 * the code does instead of restating a comment.
 */
export const POLL_INTERVAL_VISIBLE_MS = 4_000;
export const POLL_INTERVAL_HIDDEN_MS = 30_000;
export const LIMITER_BUDGET_PER_MINUTE = 120;
export const BUDGET_FRACTION = 0.4;

/**
 * Full-jitter backoff for a retryable send: `random() * min(cap, base * 2^attempt)`.
 *
 * Pure and given its own name because the *schedule* is the invariant, not the
 * number: the delay must grow, must never exceed the cap, and must depend on an
 * injected random so a test can pin both ends of the jitter range. A fixed
 * exponential without jitter is what turns one dropped signal into N devices
 * retrying in lockstep against a 120 req/min limiter.
 */
export function backoffDelayMs(options: {
  attempt: number;
  random: () => number;
  baseMs?: number;
  capMs?: number;
}): number {
  const base = options.baseMs ?? BACKOFF_BASE_MS;
  const cap = options.capMs ?? BACKOFF_CAP_MS;
  // `2 ** attempt` overflows toward Infinity at large attempts; `Math.min` with the
  // cap makes that harmless rather than producing a NaN delay.
  const ceiling = Math.min(cap, base * 2 ** Math.max(0, options.attempt));
  return Math.floor(options.random() * ceiling);
}

export function requestsPerMinute(intervalMs: number): number {
  return 60_000 / intervalMs;
}

/** Fraction of the per-user budget consumed by `visibleTabs` polling and `writesPerMinute`. */
export function budgetFractionUsed(options: {
  visibleTabs: number;
  writesPerMinute: number;
  pollIntervalMs?: number;
}): number {
  const poll = requestsPerMinute(options.pollIntervalMs ?? POLL_INTERVAL_VISIBLE_MS) * options.visibleTabs;
  return (poll + options.writesPerMinute) / LIMITER_BUDGET_PER_MINUTE;
}

export class SyncEngine {
  private readonly deps: SyncEngineDeps;
  private readonly outbox: Outbox;
  /** The single in-flight drain, per §4.3's "one in-flight batch" invariant. */
  private inFlight: Promise<ReconciliationOutcome | null> | null = null;
  /**
   * Earliest timestamp a send may happen again. Set only by a retryable failure;
   * cleared on any success. Gates *sends*, never `enqueue`: a queued tap must stay
   * durably accepted offline, and a drain that fires inside the backoff window would
   * defeat the point of counting attempts.
   */
  private nextSendAt: number | null = null;
  /** The last fatal refusal, for the caller to surface. Not retried silently. */
  private fatalReason: string | null = null;
  private poller: Promise<void> | null = null;
  private stopped = false;
  private serverSeq = 0;
  private readonly random: () => number;
  /**
   * Refused mutations, retained as visible state after they leave the queue. §4.3:
   * rejections "surface, never vanish" — the queue is not where they stay, the screen is.
   */
  private rejections: VisibleRejection[] = [];
  private readonly listeners = new Set<(snapshot: SyncSnapshot) => void>();

  constructor(deps: SyncEngineDeps) {
    this.deps = deps;
    this.outbox = deps.outbox;
    this.random = deps.random ?? Math.random;
  }

  /**
   * Queue a mutation and drain immediately.
   *
   * The returned promise resolves when the mutation is **durable**, not when the
   * server has it: that is §4.3's durable-before-acknowledged rule, and it is why
   * the runner can paint a tick as saved without lying. Whether the server accepted
   * it is reported later, through the drain's outcome and `pending$`.
   */
  async mutate(mutation: SyncMutation): Promise<StoredMutation> {
    // M4-06 (#95): the storage refusal this call can raise is reported at its origin,
    // `Outbox.enqueue`, not here — see that module for why.
    const stored = await this.outbox.enqueue(mutation);
    await this.emit();
    // Deliberately not awaited: the caller's promise is durability. A drain that
    // fails leaves the mutation queued, which is the correct outcome for a device
    // with no signal — and the poller will pick it up.
    void this.drain();
    return stored;
  }

  /**
   * The last fatal refusal, if any. A public getter rather than a field because the
   * value is meaningful to the caller (it is what a "sync failed" banner reads) and
   * must not be writable from outside.
   */
  lastFatalReason(): string | null {
    return this.fatalReason;
  }

  /** Unconfirmed mutations, oldest first. Drives the "N waiting to sync" copy. */
  async pending(): Promise<StoredMutation[]> {
    return this.outbox.peek();
  }

  /**
   * Send the pending batch, at most once concurrently.
   *
   * The guard is the whole feature: a second concurrent drain of the same queue is
   * a self-inflicted race (two batches carrying the same `mutationId`s, two chances
   * to interleave with a server `applied[]`), and the 429 budget is not a design
   * goal. A concurrent call receives the *same* promise rather than a no-op, so
   * callers cannot accidentally believe their batch was sent when it was not.
   */
  async drain(): Promise<ReconciliationOutcome | null> {
    if (this.inFlight !== null) return this.inFlight;

    // Inside the backoff window: do nothing, and do not pretend a send happened.
    // Returning null (rather than the previous outcome) is deliberate — callers get
    // "no decision" and the mutation is still queued.
    if (this.nextSendAt !== null && this.deps.now() < this.nextSendAt) return null;

    const run = this.drainOnce().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  /**
   * The browser just reported connectivity restored: clear the backoff window.
   *
   * A retryable failure schedules `nextSendAt` because "the network just said
   * not now" — and full jitter means the windows grown across a multi-minute
   * outage can reach 30 s. An `online` event that left the window standing is
   * a no-op inside it: the provider's own comment ("the browser says the moment
   * connectivity returns; draining then is free") was only true when the last
   * window happened to have expired. That gap is the mechanism behind the
   * bimodal G-M3-4 numbers (4.7–9.7 s, and once past the 15 s hang ceiling
   * under suite load) — audit entries 4 and 15 of
   * `docs/tests/2026-09-11-m3-verification-audit.md`. Reconnect is precisely
   * the event the backoff exists to wait for; it falsifies the premise, so the
   * window goes away. Attempt counts are untouched: if the browser lied about
   * coming online, the next failure regrows a *larger* window from the worst
   * attempt plus one, and the 120/min limiter still bounds the noise.
   */
  notifyConnectivityRestored(): void {
    this.nextSendAt = null;
  }

  private async drainOnce(): Promise<ReconciliationOutcome | null> {
    const batch = await this.outbox.peek(MAX_BATCH);
    if (batch.length === 0) return null;

    const outcome = await this.deps.send({
      deviceId: this.deps.deviceId,
      sinceSeq: this.serverSeq,
      mutations: batch.map((item) => item.payload),
    });

    if (outcome.kind === 'retryable') {
      // Grow the attempt count for every item in the batch, without dropping or
      // reordering anything, then schedule the next send from the worst attempt.
      let highest = 0;
      for (const item of batch) {
        const attempt = item.attempt + 1;
        await this.outbox.recordAttempt(item.mutationId, attempt);
        highest = Math.max(highest, attempt);
      }
      this.nextSendAt = this.deps.now() + backoffDelayMs({ attempt: highest, random: this.random });
      return null;
    }

    if (outcome.kind === 'fatal') {
      // Not retried into oblivion and not dropped: the mutation stays queued and the
      // reason is recorded for the caller. Silently deleting a batch the server
      // refused would lose a workout; silently retrying a 4xx forever would hide a
      // bug. No backoff window here — a fatal is not a transient — so a caller that
      // wants to stop polling has to read `fatalReason()` and decide.
      this.fatalReason = outcome.reason;
      return null;
    }

    // A successful exchange ends the backoff window, whatever its item-level results.
    this.nextSendAt = null;
    this.fatalReason = null;
    this.serverSeq = outcome.data.serverSeq;
    this.deps.onServerSeq?.(outcome.data.serverSeq);

    const result = reconcile(batch, outcome.data);

    // Order matters: forget only what the server confirmed, surface what it
    // refused, and refetch when anything was refused.
    await this.outbox.markApplied(result.applied);
    if (result.rejected.length > 0) {
      // Left the queue and *into* visible state: the server refused these, so
      // replaying them is a loop, and forgetting them is a lost set. See
      // `Outbox.discardRefused` for why both halves are required.
      await this.outbox.discardRefused(result.rejected.map((item) => item.mutationId));
      this.rejections.push(...result.rejected);
      this.deps.onRejected?.(result.rejected);
    }
    if (result.requiresRefetch) {
      await this.deps.refetch();
    }
    await this.emit();

    return result;
  }

  /**
   * Subscribe to queue changes. Returns an unsubscribe function.
   *
   * The first delivery is synchronous-ish (awaited) rather than waiting for a change,
   * so a component that mounts with three mutations already queued — the reload case
   * §4.3 Scenario 2 is about — renders "3 waiting to sync" immediately instead of
   * claiming the queue is empty until the next write.
   */
  subscribe(listener: (snapshot: SyncSnapshot) => void): () => void {
    this.listeners.add(listener);
    void this.emit();
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Read the current queue state directly.
   *
   * A pull alongside `subscribe`'s push, for two reasons: a component mounting needs
   * today's value before the next change arrives, and a test that has to await some
   * number of microtasks to observe an async emit is asserting on scheduling rather
   * than behaviour. (That is exactly what the first draft of the rejection test did.)
   */
  async snapshot(): Promise<SyncSnapshot> {
    // One read serves both fields: `pendingCount` is `pending.length`, and reading the
    // queue twice could produce a snapshot where the badge and the projection disagree.
    const pending = await this.outbox.peek();
    return {
      pending,
      pendingCount: pending.length,
      oldestAgeMs: pending.length > 0 ? Date.now() - pending[0]!.createdAt : 0,
      rejections: [...this.rejections],
      lastFatalReason: this.fatalReason,
    };
  }

  private async emit(): Promise<void> {
    if (this.listeners.size === 0) return;
    const snapshot = await this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  /**
   * Clear surfaced rejections once the caller has shown them or the user dismissed
   * them. Awaitable so a caller (and a test) can observe the new state rather than
   * guess how many microtasks an emit needs.
   */
  async dismissRejections(): Promise<void> {
    this.rejections = [];
    await this.emit();
  }

  /**
   * Poll the session. Started by the runner while a session is open.
   *
   * Two §8.3 requirements are implemented here rather than in the caller: the
   * cadence depends on visibility (`HIDDEN` is a slow poll, not a stopped one, so a
   * backgrounded tab still converges), and the loop is a `while` over an injected
   * `sleep` so a test can drive it deterministically instead of waiting in real time.
   */
  startPolling(): void {
    if (this.poller !== null) return;
    this.stopped = false;
    this.poller = this.pollLoop().finally(() => {
      this.poller = null;
    });
  }

  stopPolling(): void {
    this.stopped = true;
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      const interval = this.deps.isVisible() ? POLL_INTERVAL_VISIBLE_MS : POLL_INTERVAL_HIDDEN_MS;
      await this.deps.sleep(interval);
      if (this.stopped) return;
      await this.pollOnce();
    }
  }

  /**
   * One poll iteration: flush anything queued, then fetch authoritative state.
   *
   * Public and separate from the loop because the loop is only reachable through a
   * timer — a rule nobody can test is a rule nobody can trust. Two requests per
   * iteration in the worst case (a drain plus a refetch); when the queue is empty the
   * drain sends nothing, which is the case §8.3's budget arithmetic assumes.
   */
  async pollOnce(): Promise<void> {
    // A poll is also the natural moment to drain: the user's own queued writes must
    // not wait for the next tick after connectivity returns.
    await this.drain();
    await this.deps.refetch();
  }
}
