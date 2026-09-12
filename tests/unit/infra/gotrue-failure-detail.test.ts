/**
 * #100 — when a test helper swallows a dependency's error message, the suite loses the ability to name its
 * own reds. This pins that it cannot happen silently again.
 *
 * `100q3` failed on `a11y.spec.ts:163` with `Could not clean up M1-16 test user (500).` and nothing else.
 * Not a slow assertion: `cleanup()` threw, and the identity service's explanation — the one thing that
 * could have named the cause — was never read off the response. The same string had already appeared on
 * `session-runner.spec.ts:111`, where it was filed as unexplained, because a teardown throw is blamed on
 * whichever spec owns the fixture. Two "flakes", one episodic 500.
 *
 * So the guarantee here is narrow and specific: the helper's failure text must carry the body, must say
 * which phase it came from, and must survive an empty or oversized body without replacing one unknown with
 * another. Watched red by reverting one call site in `fixtures.ts` to the old status-only template.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeGoTrueFailure } from '../../integration/api/gotrue-failure';

const FIXTURES = readFileSync(
  join(__dirname, '..', '..', 'integration', 'api', 'fixtures.ts'),
  'utf8',
);

describe('#100: a GoTrue failure reaches the output with its own explanation', () => {
  it('carries the response body, and says which phase failed', () => {
    expect(
      describeGoTrueFailure('create', 422, '{"message":"Subject is already registered"}'),
    ).toBe('Could not create M1-16 test user (422). GoTrue said: {"message":"Subject is already registered"}');
    const cleanup = describeGoTrueFailure('cleanup', 500, 'Database error deleting user');
    expect(cleanup).toContain('(500)');
    expect(cleanup).toContain('Database error deleting user');
    // The phase is said out loud because a cleanup throw is reported against a spec whose assertions
    // passed, and the reader's first move is to go looking for a broken assertion in that spec.
    expect(cleanup).toContain('thrown by teardown, not by an assertion');
  });

  it('does not turn a missing or huge body into a second mystery', () => {
    expect(describeGoTrueFailure('cleanup', 502, '   ')).toContain('<empty response body>');
    const long = describeGoTrueFailure('cleanup', 500, 'x'.repeat(4000));
    expect(long).toContain('x'.repeat(500));
    expect(long).not.toContain('x'.repeat(501));
    // An unreadable body is reported as unreadable rather than throwing over the original failure.
    expect(describeGoTrueFailure('create', 500, '<unreadable response body>')).toContain('unreadable');
  });

  it('is used at every identity-service failure site, not just some of them', () => {
    // The regression that matters is a single call site drifting back to `${status}`, which reads as a
    // clean error and re-creates this whole problem for one path.
    const statusOnly = FIXTURES.match(/throw new Error\(\s*`Could not (create|clean up) M1-16 test user \(\$\{[^}]+\}\)\.`/g) ?? [];
    expect(statusOnly, 'a GoTrue failure throwing status-only again').toEqual([]);
    expect(FIXTURES.match(/describeGoTrueFailure\('/g)?.length).toBe(2);
    // And the delete path must read the body at all: `response.text()` was never called before #100.
    expect(FIXTURES).toMatch(/removed\.text\(\)/);
  });
});
