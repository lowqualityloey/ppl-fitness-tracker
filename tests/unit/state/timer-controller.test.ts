/**
 * M3-07 — absolute-deadline timers (#64).
 *
 * The defect this module exists for is specific and still on disk: all three legacy day modules
 * keep a countdown as a mutable counter and decrement it on a one-second interval —
 * `push-day-workout/app.js:311` is `timer.intervalId = setInterval(() => { timer.seconds--; … },
 * 1000)`. Browsers throttle background timers to roughly one tick per minute, so a 90-second rest
 * in a hidden tab finishes minutes late, and the athlete trains against a clock that lied.
 *
 * Every test below is built so that a counter-based implementation fails it. The lever is the same
 * each time: **advance the fake clock's time without letting its timers fire**, then require the
 * displayed value to match the deadline. A counter has no way to know what happened while it was
 * asleep; an absolute instant does.
 *
 * The clock is injected for the reason the card gives: the background-tab case has to be a unit
 * test, not an exercise in patience. Nothing here waits a real second.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createCountdownTimer,
  createElapsedTimer,
  type TimerClock,
} from '../../../src/app/state/timer-controller';

/**
 * A clock with two independent dials: `advance(ms, { fires: 'none' })` moves wall time while every
 * scheduled callback stays asleep — that *is* a throttled background tab — and `advance(ms)` moves
 * time and runs what comes due. A test that only ever used the second mode could not tell this
 * module from the legacy counter.
 */
class FakeClock implements TimerClock {
  time = 0;
  visibility: DocumentVisibilityState = 'visible';
  /** Every delay handed to `schedule`, in order, so cadence decisions are observable. */
  readonly scheduled: number[] = [];
  pendingCount = 0;

  #nextId = 1;
  #pending = new Map<number, { at: number; run: () => void }>();
  #listeners: Array<() => void> = [];

  readonly now = (): number => this.time;

  readonly schedule = (run: () => void, ms: number): number => {
    const id = this.#nextId++;
    this.#pending.set(id, { at: this.time + ms, run });
    this.scheduled.push(ms);
    this.pendingCount = this.#pending.size;
    return id;
  };

  readonly unschedule = (id: number): void => {
    this.#pending.delete(id);
    this.pendingCount = this.#pending.size;
  };

  readonly onVisibilityChange = (listener: () => void): (() => void) => {
    this.#listeners.push(listener);
    return () => {
      this.#listeners = this.#listeners.filter((entry) => entry !== listener);
    };
  };

  /** Fires the listeners the way a real tab does, including the value of `document.hidden`. */
  hide(): void {
    this.visibility = 'hidden';
    for (const listener of [...this.#listeners]) listener();
  }

  show(): void {
    this.visibility = 'visible';
    for (const listener of [...this.#listeners]) listener();
  }

  /**
   * @param fires `'all'` runs every callback that comes due (a foreground tab); `'none'` is a tab
   * the browser stopped servicing; a number caps how many may fire, which is how a throttled tab
   * behaves — it is not silent, it is *slow*.
   */
  advance(ms: number, { fires = 'all' }: { fires?: 'all' | 'none' | number } = {}): void {
    const target = this.time + ms;
    let budget = fires === 'all' ? Number.POSITIVE_INFINITY : fires === 'none' ? 0 : fires;

    for (;;) {
      const due = [...this.#pending.entries()]
        .filter(([, entry]) => entry.at <= target)
        .sort((a, b) => a[1].at - b[1].at)
        .at(0);
      if (!due || budget <= 0) break;
      const [id, entry] = due;
      this.#pending.delete(id);
      this.pendingCount = this.#pending.size;
      budget -= 1;
      // The callback may schedule the next repaint, so time moves before it runs.
      this.time = Math.max(this.time, entry.at);
      entry.run();
    }

    this.time = target;
  }
}

function countdown(clock: FakeClock, overrides: { tickMs?: number; onFinish?: () => void } = {}) {
  return createCountdownTimer({
    now: clock.now,
    schedule: clock.schedule,
    unschedule: clock.unschedule,
    onVisibilityChange: clock.onVisibilityChange,
    tickMs: overrides.tickMs ?? 1_000,
    onFinish: overrides.onFinish,
  });
}

describe('countdown timer — the deadline is the only stored truth', () => {
  it('derives remaining from the deadline, not from how many times it was allowed to tick', () => {
    const clock = new FakeClock();
    const timer = countdown(clock);
    timer.start(100_000);

    // Three seconds of wall time, one repaint. A counter that decrements per tick would report
    // 99 s here; the deadline says 97 s.
    clock.advance(3_000, { fires: 1 });

    expect(timer.state()?.remainingMs).toBe(97_000);
  });

  it('is correct after a three-minute background throttle, which is the defect being killed', () => {
    const clock = new FakeClock();
    const timer = countdown(clock);
    const deadline = 90_000; // a 90-second rest, the legacy default (`app.js:245`)
    timer.start(deadline);

    clock.hide();
    // 70 s pass while the tab is asleep, and the browser grants three ticks in that window —
    // roughly the once-a-minute throttle real browsers apply.
    clock.advance(70_000, { fires: 3 });
    clock.show();

    // The recompute happens on becoming visible, before any tick is needed.
    expect(timer.state()?.remainingMs).toBe(20_000);
    expect(timer.state()?.finished).toBe(false);
  });

  it('recomputes on becoming visible rather than waiting for the next repaint', () => {
    const clock = new FakeClock();
    const timer = countdown(clock);
    const seen: number[] = [];
    timer.subscribe((state) => seen.push(state.remainingMs));
    timer.start(60_000);

    clock.hide();
    clock.advance(45_000, { fires: 'none' });
    clock.show();

    expect(seen.at(-1), 'the visibility handler itself must emit the corrected value').toBe(15_000);
  });

  it('keeps counting while hidden so a foreground finish is not late', () => {
    const clock = new FakeClock();
    let finished = 0;
    const timer = countdown(clock, { onFinish: () => (finished += 1) });
    timer.start(5_000);

    clock.advance(6_000);

    expect(finished).toBe(1);
    expect(timer.state()?.remainingMs).toBe(0);
  });
});

describe('countdown timer — overrun, completion, and cancellation', () => {
  it('reports the overrun instead of freezing at zero or resetting', () => {
    const clock = new FakeClock();
    const timer = countdown(clock);
    timer.start(10_000);

    clock.advance(10_000);
    expect(timer.state()?.finished).toBe(true);
    expect(timer.state()?.overrunMs).toBe(0);

    clock.advance(75_000);
    expect(timer.state()?.remainingMs, 'never negative: the display has a separate overrun field').toBe(0);
    expect(timer.state()?.overrunMs, '1:15 over, shown to the athlete rather than hidden').toBe(75_000);
    expect(timer.state()?.finished, 'a finished timer that keeps drifting is information, not a bug').toBe(true);
  });

  it('announces completion exactly once across ticks, drift, and a visibility round trip', () => {
    const clock = new FakeClock();
    let finished = 0;
    const timer = countdown(clock, { onFinish: () => (finished += 1) });
    timer.start(2_000);

    clock.hide();
    clock.advance(30_000, { fires: 2 });
    clock.show();
    clock.advance(30_000);

    expect(finished).toBe(1);
  });

  it('a throwing completion cue cannot strand the timer', () => {
    const clock = new FakeClock();
    const timer = countdown(clock, {
      onFinish: () => {
        throw new Error('AudioContext refused to start');
      },
    });
    const seen: number[] = [];
    timer.subscribe((state) => seen.push(state.remainingMs));
    timer.start(1_000);

    expect(() => clock.advance(3_000)).not.toThrow();
    expect(timer.state()?.finished).toBe(true);
    expect(seen.length, 'the visual timer must keep working when the audio one does not').toBeGreaterThan(
      1,
    );
  });

  it('cancel() stops emissions and leaves no scheduled work behind', () => {
    const clock = new FakeClock();
    const timer = countdown(clock);
    let emissions = 0;
    timer.subscribe(() => (emissions += 1));
    timer.start(30_000);
    clock.advance(2_000);
    const before = emissions;
    expect(before).toBeGreaterThan(0);

    timer.cancel();
    clock.advance(60_000);
    clock.show();

    expect(emissions, 'no write into the next phase’s UI').toBe(before);
    expect(clock.pendingCount, 'a leaked interval outliving its phase is the defect').toBe(0);
  });

  it('starting a new deadline replaces the running one without leaking a timer', () => {
    const clock = new FakeClock();
    const timer = countdown(clock);
    timer.start(30_000);
    clock.advance(5_000);
    timer.start(120_000); // the athlete adds time

    expect(clock.pendingCount, 'one repaint chain, not two').toBe(1);
    clock.advance(1_000);
    expect(timer.state()?.remainingMs).toBe(114_000);
  });

  it('clamps the last repaint to the deadline so completion is not up to a tick late', () => {
    const clock = new FakeClock();
    const timer = countdown(clock, { tickMs: 1_000 });
    timer.start(2_500);

    clock.advance(2_000);
    // Two ordinary steps, then one that lands exactly on the deadline instead of up to a tick
    // after it: [1000, 1000, 500] is the whole cadence story of a 2.5 s countdown.
    expect(clock.scheduled.slice(0, 3)).toEqual([1_000, 1_000, 500]);
  });

  it('ignores a deadline already in the past instead of starting a timer that never finishes', () => {
    const clock = new FakeClock();
    let finished = 0;
    const timer = countdown(clock, { onFinish: () => (finished += 1) });
    timer.start(1_000);
    timer.cancel();
    // A deadline already behind the clock: finished on arrival, not a timer that runs forever.
    timer.start(-1);

    expect(timer.state()?.finished).toBe(true);
    expect(timer.state()?.overrunMs).toBe(1);
    expect(finished).toBe(1);
    expect(clock.pendingCount, 'the overrun keeps updating, so the chain stays alive').toBe(1);
  });
});

describe('elapsed timer — the session clock', () => {
  it('counts up from an absolute origin and survives a throttled tab', () => {
    const clock = new FakeClock();
    const timer = createElapsedTimer({
      now: clock.now,
      schedule: clock.schedule,
      unschedule: clock.unschedule,
      onVisibilityChange: clock.onVisibilityChange,
      });
    timer.start(0);

    clock.hide();
    clock.advance(1_800_000, { fires: 2 }); // half an hour asleep, two ticks granted
    clock.show();

    expect(timer.state()?.elapsedMs).toBe(1_800_000);
  });

  it('never resets when the tab is hidden and shown again', () => {
    const clock = new FakeClock();
    const timer = createElapsedTimer({
      now: clock.now,
      schedule: clock.schedule,
      unschedule: clock.unschedule,
      onVisibilityChange: clock.onVisibilityChange,
      });
    timer.start(0);
    clock.advance(60_000);
    clock.hide();
    clock.advance(10_000, { fires: 'none' });
    clock.show();

    expect(timer.state()?.elapsedMs).toBe(70_000);
    timer.cancel();
    expect(clock.pendingCount).toBe(0);
  });
});

describe('timers are client-only state', () => {
  /*
   * The master RFC's state table lists timer deadlines as "client only, never synced". That is a
   * data-integrity rule, not a style preference: a rest deadline that reached the server would be
   * replayed, reconciled, and conflict-resolved against a clock on another device, and the athlete
   * would be told to wait for a rest period that already happened. It is asserted against the
   * source because there is no runtime boundary to test — the module simply must not own one.
   */
  it('touches no transport, storage, or outbox', () => {
    const source = readFileSync('src/app/state/timer-controller.ts', 'utf8');

    // `from './outbox'` rather than the bare word: this file *describes* the outbox in comments,
    // and a scan that forbids prose will be edited away the first time it annoys someone.
    for (const forbidden of ['fetch(', 'XMLHttpRequest', 'sendBeacon', "from './outbox'", 'localStorage', 'indexedDB']) {
      expect(source, `timer state must never leave the tab (${forbidden})`).not.toContain(forbidden);
    }
  });
});
