import { expect, test } from '@playwright/test';

import { signInFreshUser } from './auth';
import {
  advanceIntoRest,
  START_DAY,
  startPushDay,
  waitForSynced,
  WORKOUT_FLOW_TIMEOUT_MS,
} from './runner-fixtures';

/**
 * M3-07 (#64): rest and elapsed timers that survive a backgrounded tab.
 *
 * The unit specs in `tests/unit/state/timer-controller.test.ts` prove the arithmetic against an
 * injected clock, which is what the card asks for — "the background-tab case is a unit test, not an
 * exercise in patience". These specs answer the different question a unit test cannot: does the
 * screen actually *use* the machinery, and does the browser's real visibility plumbing reach it?
 *
 * Two clocks are therefore in play below, deliberately:
 * - **A faked one** (`page.clock`), which makes 80 seconds of backgrounding cost no wall time and,
 *   more importantly, makes the throttle exact: `fastForward` fires a self-rescheduling timer chain
 *   once across the jump rather than eighty times, which is precisely the shape of a suspended tab.
 * - **A real one** (the last spec), because a fake clock that proves my arithmetic could also be
 *   proving nothing about the browser. That one hides the page behind a second tab and waits real
 *   seconds, with a tolerance wide enough for a loaded machine and narrow enough to catch a counter.
 */

/**
 * A `document.visibilityState` that a test can move, with the event that a real tab fires.
 *
 * Only the *state* is stubbed. Chromium's timer throttling is disabled under Playwright's default
 * launch flags, so a hidden page keeps ticking here — which is exactly why the value is what the
 * assertion reads rather than the tick count. The last spec measures the real thing.
 */
async function installVisibilityStub(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
    (window as unknown as Record<string, unknown>).__setHidden = (value: boolean) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
}

/**
 * An `AudioContext` that counts itself, so the two audio invariants become observable.
 *
 * "Unlock on the first gesture" and "announce the finish exactly once" have no DOM footprint to
 * assert — a suspended context fails silently, which is the whole problem — so what is observable
 * is how many contexts the page constructed and how many times it was asked to beep.
 *
 * It has to be a real constructor. The first version of this spy assigned an arrow function to
 * `window.AudioContext`, and `new` on an arrow throws `TypeError: not a constructor` — which the
 * chime caught as its documented silent fallback, so the spec read "no beeps" and I spent a run
 * chasing the app's event listeners when the harness was the thing that could not be built. A spy
 * that fails inside a `try/catch` designed to swallow failures is a test that cannot pass, and it
 * is worth saying in the PR that this one was wrong before it was right.
 */
async function installAudioSpy(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const counts = { contexts: 0, beeps: 0 };
    (window as unknown as Record<string, unknown>).__audio = counts;

    class SpyAudioContext {
      state = 'suspended';
      currentTime = 0;
      destination = {};

      constructor() {
        counts.contexts += 1;
      }

      resume() {
        this.state = 'running';
        return Promise.resolve();
      }

      createOscillator() {
        counts.beeps += 1;
        return {
          type: 'sine',
          frequency: { setValueAtTime: () => undefined },
          connect: () => ({ connect: () => undefined }),
          start: () => undefined,
          stop: () => undefined,
        };
      }

      createGain() {
        return {
          gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
        };
      }

      close() {
        this.state = 'closed';
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: SpyAudioContext,
    });
  });
}

/** `m:ss` (optionally `+m:ss`) into whole seconds, for arithmetic on what the screen shows. */
function secondsOf(text: string): number {
  const [minutes = '0', seconds = '0'] = text.replace('+', '').trim().split(':');
  return Number(minutes) * 60 + Number(seconds);
}

/** Typed as the shape the spy writes, not a `Record` lookup: `noUncheckedIndexedAccess` is on. */
interface AudioCounts {
  contexts: number;
  beeps: number;
}

async function audioCounts(page: import('@playwright/test').Page): Promise<AudioCounts> {
  return page.evaluate(() => (window as unknown as { __audio: AudioCounts }).__audio);
}

async function hidden(page: import('@playwright/test').Page, value: boolean) {
  await page.evaluate((state) => {
    (window as unknown as { __setHidden: (v: boolean) => void }).__setHidden(state);
  }, value);
}

test.describe('session timers', () => {
  test('reads the clock, not its own ticks, after eighty seconds in the background', async ({
    page,
  }) => {
    test.setTimeout(WORKOUT_FLOW_TIMEOUT_MS);
    const auth = await signInFreshUser(page, 'e2e-timer-throttle');
    try {
      await page.clock.install({ time: Date.now() });
      await installVisibilityStub(page);
      await installAudioSpy(page);

      await startPushDay(page);
      await advanceIntoRest(page);

      const remaining = page.getByTestId('rest-remaining');
      // 90 s is the legacy default this module replaces. The clock keeps advancing with real time
      // after `install` — it is not paused, and pausing it would also freeze the sync engine's
      // drain timers and stop this screen from ever reaching "synced" — so the reading is asserted
      // as a range rather than a literal, and the arithmetic below is done *relative* to what the
      // screen actually said.
      await expect(remaining).toHaveText(/1:[0-2]\d/);
      const beforeHide = secondsOf(await remaining.innerText());

      await hidden(page, true);
      await page.clock.fastForward(80_000);
      await hidden(page, false);

      const afterShow = secondsOf(await remaining.innerText());
      // The clock moved 80 s and the display agrees, within the few seconds of test work around
      // the jump. This is where the whole defect lives: a countdown stored as a counter subtracts
      // what its ticks added up to, so a tab that was granted three repaints would still read
      // roughly 86 s here — `beforeHide - 3` — and every assertion below would pass by luck
      // instead of by construction.
      expect(beforeHide - afterShow, 'the display moved with the clock').toBeGreaterThanOrEqual(76);
      expect(beforeHide - afterShow).toBeLessThanOrEqual(84);
      expect(afterShow, 'the rest is nearly over, not merely three ticks older').toBeLessThan(16);

      // Same machinery, opposite direction: the session clock is `now - startedAt`, so it gained
      // exactly the time that passed and never noticed the missed repaints at all.
      await expect(page.getByTestId('session-elapsed')).toContainText(/Elapsed \d:\d\d/);

      // Past the deadline the timer shows how far over it is instead of pinning at zero, and the
      // completion is delivered once rather than once per repaint.
      await hidden(page, true);
      await page.clock.fastForward(130_000);
      await hidden(page, false);

      const over = secondsOf((await remaining.innerText()).replace('+', ''));
      expect(over, 'the overrun keeps growing rather than freezing at 0:00').toBeGreaterThan(50);
      await expect(page.getByTestId('rest-overrun')).toBeVisible();
      await expect(page.locator('[role="status"]')).toContainText('Rest complete');

      const counts = await audioCounts(page);
      expect(counts.beeps, 'the finish cue fires once, not once per repaint').toBe(1);
    } finally {
      await auth.cleanup();
    }
  });

  test('constructs no audio context until the athlete touches the screen', async ({ page }) => {
    const auth = await signInFreshUser(page, 'e2e-audio-gesture');
    try {
      await installVisibilityStub(page);
      await installAudioSpy(page);

      await startPushDay(page);
      expect(
        (await audioCounts(page)).contexts,
        'the day started with a click, but no runner has mounted yet',
      ).toBe(0);

      // The two clicks below go through `toggleTask` and the phase-advance handler, both of which
      // arm the chime from inside the handler. Exactly one context for all of it: a page that
      // constructed one per tap would be the same bug wearing a different hat, and the assertion
      // is `toBe(1)` rather than `toBeLessThanOrEqual(1)` so it cannot pass by never arming.
      await advanceIntoRest(page);
      await page.getByTestId('rest-extend').click();
      expect((await audioCounts(page)).contexts, 'one context, created by a gesture').toBe(1);

      // And the silent stub — which cannot produce sound at all — has not broken the timer.
      await expect(page.getByTestId('rest-remaining')).toBeVisible();
    } finally {
      await auth.cleanup();
    }
  });

  test('leaves no timer running behind it when the phase advances', async ({ page }) => {
    test.setTimeout(WORKOUT_FLOW_TIMEOUT_MS);
    const auth = await signInFreshUser(page, 'e2e-timer-cancel');
    try {
      await installVisibilityStub(page);
      await startPushDay(page);
      await advanceIntoRest(page);
      await expect(page.getByTestId('rest-timer')).toBeVisible();

      // The way an athlete actually leaves a rest early: finish the work and move on. Every set
      // must be logged before `stretch` will accept the transition, which the server enforces and
      // this screen cannot — so the flow is real rather than asserted away.
      const ticks = page.locator('[data-testid^="tick-"]');
      for (let index = 0, total = await ticks.count(); index < total; index += 1) {
        const tick = ticks.nth(index);
        if ((await tick.getAttribute('aria-pressed')) === 'false') await tick.click();
      }
      await waitForSynced(page);
      await page.getByTestId('task-main_workout').click();
      await waitForSynced(page);
      await page.getByTestId('advance-phase').click();
      await expect(page.getByTestId('session-subtitle')).toContainText('Stretching');

      // Gone on the transition, and still gone a minute of clock later: no interval survived to
      // write a number into the next phase's UI.
      await expect(page.getByTestId('rest-timer')).toHaveCount(0);
      await page.waitForTimeout(3_000);
      await expect(page.getByTestId('rest-timer')).toHaveCount(0);
      await expect(page.getByTestId('rest-remaining')).toHaveCount(0);

      // The session clock is the one that stays, and it keeps counting while the timer does not:
      // two different numbers, one of which is finished and one of which is live.
      await expect(page.getByTestId('session-elapsed')).toContainText('Elapsed');
    } finally {
      await auth.cleanup();
    }
  });

  /*
   * The one spec here that fakes nothing about time.
   *
   * The earlier draft tried to background the tab by bringing a second page to the front, and it
   * proved only that this assumption is folklore: under headless Chromium both pages kept reporting
   * `visibilityState === 'visible'`, so the test was asserting a state change that never happened.
   * What a backgrounded tab *is*, mechanically, is a page whose scripts stop running. CDP can ask
   * for exactly that — `Page.setWebLifecycleState('frozen')` — and unfreezing it delivers the real
   * `visibilitychange`, on a real document, against a real clock, with real timers that really did
   * not fire.
   *
   * So this spec cannot tell a reader "the browser throttled it to one tick a minute". It says
   * something stronger and smaller: **the page was frozen solid for four seconds, nothing in it
   * ran, and the number on screen was still right when it woke up.**
   */
  test('is still correct after the page is frozen solid by the browser', async ({ page, context }) => {
    test.setTimeout(WORKOUT_FLOW_TIMEOUT_MS);
    const auth = await signInFreshUser(page, 'e2e-timer-frozen');
    try {
      await startPushDay(page);
      await advanceIntoRest(page);

      const remaining = page.getByTestId('rest-remaining');
      const before = secondsOf(await remaining.innerText());

      const cdp = await context.newCDPSession(page);
      await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });

      // Wait from outside the frozen page: nothing in it is running, so a `page.waitForTimeout`
      // here would be a timeout that nobody is counting.
      const slept = 4_000;
      await new Promise((resolve) => setTimeout(resolve, slept));
      await cdp.send('Page.setWebLifecycleState', { state: 'active' });

      const after = secondsOf(await remaining.innerText());
      expect(before - after, 'four real seconds of frozen page, four seconds off the clock').toBeGreaterThanOrEqual(
        Math.floor(slept / 1_000) - 1,
      );
      expect(before - after).toBeLessThanOrEqual(Math.floor(slept / 1_000) + 2);
    } finally {
      await auth.cleanup();
    }
  });

  test('a finished session shows a length, not a clock that keeps counting', async ({ page }) => {
    test.setTimeout(WORKOUT_FLOW_TIMEOUT_MS);
    const auth = await signInFreshUser(page, 'e2e-timer-finished');
    try {
      await page.clock.install({ time: Date.now() });
      await startPushDay(page);

      await page.getByTestId('task-warm_up').click();
      await waitForSynced(page);
      await page.getByTestId('advance-phase').click();

      const ticks = page.locator('[data-testid^="tick-"]');
      for (let index = 0, total = await ticks.count(); index < total; index += 1) {
        const tick = ticks.nth(index);
        if ((await tick.getAttribute('aria-pressed')) === 'false') await tick.click();
      }
      await waitForSynced(page);
      // `exercise` -> `rest` is ungated; the `main_workout` task is what blocks the move into
      // `stretch`, and `stretch` blocks `post_workout`. One advance per gate, in that order.
      await page.getByTestId('advance-phase').click();
      await page.getByTestId('task-main_workout').click();
      await waitForSynced(page);
      await page.getByTestId('advance-phase').click();
      await page.getByTestId('task-stretch').click();
      await waitForSynced(page);
      await page.getByTestId('advance-phase').click();
      await page.getByTestId('finish-session').click();
      await waitForSynced(page);

      await expect(page.getByRole('heading', { level: 1, name: START_DAY })).toBeVisible();
      await expect(page.getByTestId('session-elapsed')).toContainText('Workout length');

      // Two minutes of clock, and the number does not move: it is a measurement of something that
      // ended, not a stopwatch nobody stopped.
      const frozen = await page.getByTestId('session-elapsed').innerText();
      await page.clock.fastForward(120_000);
      await page.waitForTimeout(2_000);
      await expect(page.getByTestId('session-elapsed')).toHaveText(frozen);
    } finally {
      await auth.cleanup();
    }
  });
});
