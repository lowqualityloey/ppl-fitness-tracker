/**
 * The chime's invariants, from #64: audio unlocks on a gesture only, and silence is a supported
 * state. Both are cheap to get wrong and invisible when you do — a suspended `AudioContext` fails
 * without an error — so they are pinned here rather than discovered in a gym.
 */

import { describe, expect, it } from 'vitest';
import { createChime, type ChimeContext } from '../../../src/app/state/audio-cue';

class FakeContext implements ChimeContext {
  resumes = 0;
  beeps: Array<{ frequencyHz: number; durationMs: number }> = [];

  constructor(readonly overrideState: ChimeContext['state'] = 'suspended') {}

  get state(): ChimeContext['state'] {
    return this.overrideState;
  }

  resume(): void {
    this.resumes += 1;
  }

  beep(frequencyHz: number, durationMs: number): void {
    this.beeps.push({ frequencyHz, durationMs });
  }
}

describe('rest chime — gesture-gated', () => {
  it('constructs no audio context until a gesture, including when asked to play', () => {
    // The failure this pins is the quiet one: a context built on mount starts suspended, the chime
    // never sounds, and nothing anywhere reports an error.
    let constructions = 0;
    const chime = createChime({
      createContext: () => {
        constructions += 1;
        return new FakeContext('running');
      },
    });

    chime.play();
    expect(constructions, 'play() must not lazily construct a context').toBe(0);
    expect(chime.armed).toBe(false);

    chime.unlock();
    expect(constructions).toBe(1);
    expect(chime.armed).toBe(true);
  });

  it('unlocks once, and resumes a context that arrives suspended', () => {
    const contexts: FakeContext[] = [];
    const chime = createChime({
      createContext: () => {
        const context = new FakeContext('suspended');
        contexts.push(context);
        return context;
      },
    });

    chime.unlock();
    chime.unlock();
    chime.unlock();

    expect(contexts.length).toBe(1);
    expect(contexts[0]?.resumes).toBe(1);
  });

  it('sounds with the configured tone once armed', () => {
    const context = new FakeContext('running');
    const chime = createChime({
      createContext: () => context,
      tone: { frequencyHz: 440, durationMs: 250 },
    });

    chime.unlock();
    chime.play();

    expect(context.beeps).toEqual([{ frequencyHz: 440, durationMs: 250 }]);
  });
});

describe('rest chime — silence is a supported state', () => {
  it('is silent and unbothered on a platform without Web Audio', () => {
    const chime = createChime({});

    expect(() => {
      chime.unlock();
      chime.play();
    }).not.toThrow();
    expect(chime.armed, 'nothing to arm, and the timer must not treat that as failure').toBe(false);
  });

  it('gives up once when the constructor throws, instead of retrying on every tap', () => {
    let attempts = 0;
    const chime = createChime({
      createContext: () => {
        attempts += 1;
        throw new Error('NotAllowedError: audio blocked');
      },
    });

    chime.unlock();
    chime.unlock();
    chime.unlock();
    chime.play();

    expect(attempts, 'a blocked audio stack is not re-litigated per gesture').toBe(1);
    expect(chime.armed).toBe(false);
  });

  it('drops a context that dies between unlock and play, and stays silent afterwards', () => {
    const context = new FakeContext('running');
    context.beep = () => {
      throw new Error('context closed');
    };
    const chime = createChime({ createContext: () => context });
    chime.unlock();
    expect(chime.armed).toBe(true);

    expect(() => chime.play()).not.toThrow();
    expect(chime.armed, 'the dead context was released').toBe(false);
    expect(() => chime.play()).not.toThrow();
  });
});
