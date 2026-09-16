/**
 * Absolute-deadline timers (M3-07, #64).
 *
 * ### Why this module exists
 *
 * The master RFC's justification is a defect that was on disk until #103, three times over: every
 * timer in the legacy day modules stored a countdown as a mutable counter and decremented it on a
 * one-second interval — `push-day-workout/app.js:311` was
 * `timer.intervalId = setInterval(() => { timer.seconds--; … }, 1000)`, with the same shape in
 * `pull-day-workout/app.js` and `legs-day-workout/app.js`. Browsers throttle background timers to
 * roughly one tick per minute, so a 90-second rest started in a tab that gets backgrounded at
 * T+10 s reports ~80 s remaining when it comes back at T+80 s. The counter did not know it had been
 * asleep. Storing an absolute instant and deriving everything from `now - deadline` kills the
 * *class* of bug rather than the instance, and it costs nothing to do because the display has to
 * recompute on every repaint anyway.
 *
 * ### The rule this file enforces
 *
 * **No code path holds a remaining-seconds counter as truth.** The only stored number is the
 * anchor — a deadline for a countdown, an origin for elapsed time — and `state()` derives from the
 * clock on every call rather than returning a cached reading. That is why the tests can advance
 * time without letting callbacks fire and still expect the right answer: a cached value would be
 * the legacy bug in a new costume.
 *
 * ### Never synced
 *
 * The RFC's state table lists timer deadlines as client-only, and this module owns no transport,
 * no storage, and no reference to the outbox. A rest deadline that reached the server would be
 * replayed and last-write-wins merged against a clock on another device, telling an athlete to sit
 * through a rest period that already happened. `tests/unit/state/timer-controller.test.ts` asserts
 * it against the source, because there is no runtime boundary to test — the module must simply not
 * own one.
 *
 * ### Seams
 *
 * `TimerClock` is the whole dependency surface, and it is injected for the reason the card gives:
 * the background-tab case has to be a unit test, not an exercise in patience. The browser
 * implementation is `browserTimerClock()`; nothing else in this file touches a global.
 */

/** The clock and the two browser facilities a timer needs: scheduling, and notice of tab state. */
export interface TimerClock {
  /** Epoch milliseconds. Every reading in this module is `now()` minus an anchor. */
  now(): number;
  /** Returns a handle that `unschedule` accepts. A repeating chain is built by re-arming. */
  schedule(run: () => void, ms: number): number;
  unschedule(handle: number): void;
  /**
   * Called when the tab becomes visible again. The listener is not told *why*, and does not need
   * to know: the reading is re-derived from `now()`, so whether the browser fired twice or twice
   * hundred while the tab slept changes nothing.
   */
  onVisibilityChange(listener: () => void): () => void;
  /** Repaint cadence in milliseconds. Correctness never depends on it. */
  readonly tickMs?: number;
  /** Fired once per anchor, at the moment the deadline passes. */
  onFinish?: () => void;
}

export interface CountdownState {
  /** The stored truth: an absolute epoch instant. */
  readonly deadline: number;
  /** Never negative; the display reads `overrunMs` instead of a signed number. */
  readonly remainingMs: number;
  /** How far past the deadline the clock has gone. Grows after `finished`. */
  readonly overrunMs: number;
  readonly finished: boolean;
}

export interface ElapsedState {
  /** The absolute instant the timer counts from — a session's `startedAt`. */
  readonly origin: number;
  readonly elapsedMs: number;
}

/** A running timer. `state()` is `null` only when nothing is anchored. */
export interface Timer<S> {
  /**
   * Anchor the timer to an absolute epoch instant, replacing anything already running.
   *
   * The parameter is an *instant*, not a duration: callers compute `now() + 90_000` so that a
   * queued, delayed, or re-rendered start cannot silently shorten the rest.
   */
  start(anchorEpochMs: number): void;
  cancel(): void;
  subscribe(listener: (state: S) => void): () => void;
  state(): S | null;
}

interface Reading<S> {
  readonly state: S;
  readonly finished: boolean;
  /** How long until the next repaint is genuinely worth taking. */
  readonly repaintIn: number;
}

/**
 * The shared machinery: hold one anchor, repaint on a cadence, recompute on visibility, fire
 * `onFinish` once. `derive` supplies the arithmetic, which is the only thing that differs between
 * a countdown and an elapsed clock.
 */
function createTimer<S>(
  clock: TimerClock,
  derive: (now: number, anchor: number, tickMs: number) => Reading<S>,
): Timer<S> {
  const tickMs = clock.tickMs ?? 1_000;
  const listeners = new Set<(state: S) => void>();

  let anchor: number | null = null;
  let handle: number | null = null;
  let detachVisibility: (() => void) | null = null;
  let finishFired = false;

  const current = (): Reading<S> | null =>
    anchor === null ? null : derive(clock.now(), anchor, tickMs);

  const disarm = (): void => {
    if (handle !== null) {
      clock.unschedule(handle);
      handle = null;
    }
  };

  const emit = (): void => {
    const reading = current();
    if (!reading) return;

    if (reading.finished && !finishFired) {
      finishFired = true;
      try {
        clock.onFinish?.();
      } catch {
        /*
         * The completion cue is audio, and audio is optional: an `AudioContext` that refuses to
         * start is a supported state, not an error. Letting it throw out of here would stop the
         * visual timer too, which is the worse failure by a wide margin.
         */
      }
    }

    for (const listener of [...listeners]) listener(reading.state);
  };

  const arm = (): void => {
    const reading = current();
    if (!reading) return;
    // A non-positive interval still means "next task", and after a finish the chain keeps running
    // so the overrun stays honest rather than freezing at the moment the beep went off.
    handle = clock.schedule(tick, Math.max(0, reading.repaintIn));
  };

  const tick = (): void => {
    handle = null;
    emit();
    arm();
  };

  const handleVisibility = (): void => {
    // The whole point of the module in one line: on becoming visible, re-derive from the clock.
    // Whatever the browser did or did not fire while the tab was asleep is irrelevant.
    if (anchor === null) return;
    emit();
    // The throttled chain may be sitting on a delay that is now meaningless; re-arm from here.
    disarm();
    arm();
  };

  return {
    start(anchorEpochMs: number): void {
      disarm();
      anchor = anchorEpochMs;
      finishFired = false;
      detachVisibility ??= clock.onVisibilityChange(handleVisibility);
      emit();
      arm();
    },

    cancel(): void {
      disarm();
      if (detachVisibility) {
        detachVisibility();
        detachVisibility = null;
      }
      anchor = null;
      finishFired = false;
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      // Hand the new subscriber the current reading immediately, so a component that mounts
      // mid-rest paints the right number on its first render instead of a placeholder.
      const reading = current();
      if (reading) listener(reading.state);
      return () => {
        listeners.delete(listener);
      };
    },

    state(): S | null {
      return current()?.state ?? null;
    },
  };
}

/**
 * A countdown to an absolute instant.
 *
 * After the deadline it keeps reporting a growing `overrunMs` instead of resetting or pinning at
 * zero: an athlete who comes back four minutes late needs to see that they are 3:40 over, which is
 * information about their rest, while a frozen `0:00` would be a clock that lied in the other
 * direction.
 */
export function createCountdownTimer(clock: TimerClock): Timer<CountdownState> {
  return createTimer<CountdownState>(clock, (now, deadline, tickMs) => {
    const delta = deadline - now;
    const finished = delta <= 0;
    return {
      state: {
        deadline,
        remainingMs: finished ? 0 : delta,
        // `Math.max`, not `-delta`: at the exact deadline `delta` is `0`, and negating it yields
        // `-0`, which is a value that formats as "0" but compares unequal to it.
        overrunMs: finished ? Math.max(0, now - deadline) : 0,
        finished,
      },
      finished,
      // Land exactly on the deadline: with a plain 1 s cadence, completion can be up to a full
      // tick late, which is the same complaint as the legacy counter, only smaller.
      repaintIn: finished ? tickMs : Math.min(tickMs, delta),
    };
  });
}

/**
 * Elapsed time since an absolute instant — the session clock.
 *
 * Same mechanism, opposite direction, and the same failure it prevents: an elapsed timer built by
 * adding a second per tick understates the session after any period of throttling, which is how a
 * workout ends up reporting 22 minutes when it took 40.
 */
export function createElapsedTimer(clock: TimerClock): Timer<ElapsedState> {
  return createTimer<ElapsedState>(clock, (now, origin, tickMs) => ({
    state: { origin, elapsedMs: Math.max(0, now - origin) },
    finished: false,
    repaintIn: tickMs,
  }));
}

/**
 * The browser implementation of the seam.
 *
 * `setTimeout` handles are numbers in a window context, which is what `TimerClock` asks for; the
 * casts are the two places this module touches a global, and they are here rather than in the
 * machinery so the unit suite can run in a `node` environment.
 */
export function browserTimerClock(tickMs = 1_000): TimerClock {
  return {
    now: () => Date.now(),
    schedule: (run, ms) => window.setTimeout(run, ms) as unknown as number,
    unschedule: (handle) => window.clearTimeout(handle),
    onVisibilityChange: (listener) => {
      const handler = (): void => {
        if (document.visibilityState === 'hidden') return;
        listener();
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
    tickMs,
  };
}

/**
 * Formats a millisecond duration as `m:ss`, and an overrun as `+m:ss`.
 *
 * Exported because both the countdown and the elapsed display need it, and a third place that
 * rounds differently is how two timers on one screen disagree.
 */
export function formatDuration(ms: number, { overrun = false }: { overrun?: boolean } = {}): string {
  const total = Math.floor(Math.abs(ms) / 1_000);
  const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return overrun ? `+${text}` : text;
}
