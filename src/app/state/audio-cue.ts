/**
 * The rest chime, and the two rules that make it possible to write down (M3-07, #64).
 *
 * 1. **An `AudioContext` may only be created or resumed from a user gesture.** Browsers refuse to
 *    start audio otherwise, so a context constructed on mount arrives suspended and stays that
 *    way: the athlete hears nothing at the end of their rest and there is no error to show for it.
 *    So this module separates *unlock* — which the runner calls from a real pointer/keyboard
 *    handler — from *play*, and `play()` before an unlock is a no-op rather than a lazy
 *    construction. That is the difference between a chime that works and one that appears to.
 * 2. **Silence is a supported state, not a failure.** No `AudioContext` on the platform, one that
 *    throws on construction, one that refuses `resume()`: all three leave the timer fully working
 *    and the screen fully informative, because the completion is *also* announced to assistive
 *    tech and shown on screen. A cue that can throw into the timer's finish path would turn a
 *    missing speaker into a broken workout.
 *
 * The context is behind a seam with three members, so the rules above are testable in a `node`
 * vitest environment. The browser implementation is `browserChime()`, and the synthesis inside it
 * is deliberately the thinnest thing that makes a short beep: an oscillator into a gain envelope,
 * because a gain ramp is what keeps it from clicking.
 */

/**
 * The minimum surface a chime needs from an audio context.
 *
 * `interrupted` is iOS's state for "the OS took the audio device away" (a call, a Siri request,
 * the screen locking mid-set) and it is the single most likely state a gym phone will be in, so it
 * is part of the seam rather than a surprise. Anything not `running` is treated as needing a
 * resume, and a resume that is refused is caught: the four states differ in *why* they are silent,
 * and the chime's only obligation is to not be the thing that breaks the timer.
 */
export type ChimeContextState = 'suspended' | 'running' | 'closed' | 'interrupted';

export interface ChimeContext {
  readonly state: ChimeContextState;
  resume(): void;
  beep(frequencyHz: number, durationMs: number): void;
}

export interface Chime {
  /** Called from a user gesture. Idempotent; never throws. */
  unlock(): void;
  /** Called when a rest ends. Silent unless `unlock()` has succeeded. Never throws. */
  play(): void;
  /** Whether a gesture has produced a usable context. Exposed for the screen's own honesty. */
  readonly armed: boolean;
}

export interface ChimeDeps {
  /** Absent on platforms without Web Audio, which is a supported state, not an error. */
  createContext?: () => ChimeContext;
  /** Overridable so a test can assert the shape of the sound without hearing it. */
  tone?: { readonly frequencyHz: number; readonly durationMs: number };
}

const DEFAULT_TONE = { frequencyHz: 660, durationMs: 180 } as const;

export function createChime(deps: ChimeDeps): Chime {
  const tone = deps.tone ?? DEFAULT_TONE;
  let context: ChimeContext | null = null;
  let givenUp = false;

  return {
    unlock(): void {
      if (context || givenUp) return;
      if (!deps.createContext) {
        // No Web Audio here. Recorded as "given up" so the gesture handler is not re-attempting
        // construction on every tap, which is the only cost this state has.
        givenUp = true;
        return;
      }
      try {
        const candidate = deps.createContext();
        // A context that is not already running needs the resume, and it needs it *here*, inside
        // the gesture. Deferring it to play() is the mistake that makes the chime silent.
        if (candidate.state !== 'running') candidate.resume();
        context = candidate;
      } catch {
        // A blocked or broken audio stack. Silent from here on, and the timer does not care.
        context = null;
        givenUp = true;
      }
    },

    play(): void {
      if (!context) return;
      try {
        if (context.state !== 'running') context.resume();
        context.beep(tone.frequencyHz, tone.durationMs);
      } catch {
        // The context can die between unlock and play — a tab that was discarded, a device that
        // disappeared. The completion is already on screen and already announced.
        context = null;
      }
    },

    get armed(): boolean {
      return context !== null;
    },
  };
}

/**
 * The browser chime. Kept out of `createChime` so the rules above stay testable without a DOM,
 * and so the only file that constructs an `AudioContext` is the one a reader expects it in.
 */
export function browserChime(tone?: ChimeDeps['tone']): Chime {
  return createChime({
    tone,
    createContext:
      typeof window === 'undefined' || typeof window.AudioContext === 'undefined'
        ? undefined
        : () => {
            const audio = new window.AudioContext();
            return {
              get state() {
                return audio.state;
              },
              resume: () => {
                void audio.resume();
              },
              beep: (frequencyHz, durationMs) => {
                const oscillator = audio.createOscillator();
                const gain = audio.createGain();
                const start = audio.currentTime;
                const end = start + durationMs / 1_000;

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(frequencyHz, start);
                // An envelope, not a hard cut: an abrupt gain change is audible as a click, which
                // is a worse thing to put in someone's ear than no sound at all.
                gain.gain.setValueAtTime(0, start);
                gain.gain.linearRampToValueAtTime(0.25, start + 0.01);
                gain.gain.linearRampToValueAtTime(0, end);

                oscillator.connect(gain).connect(audio.destination);
                oscillator.start(start);
                oscillator.stop(end);
              },
            };
          },
  });
}
