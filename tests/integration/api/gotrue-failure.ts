/**
 * Put the identity service's own explanation into the error text.
 *
 * `#100`'s `100q3` red was `Could not clean up M1-16 test user (500)` — and the only thing the helper
 * reported was the status code, because the delete path never read a body and the create path parsed one
 * and threw it away. So GoTrue answered its own failure and we discarded the answer, which is how a single
 * episodic 500 came to be filed as two unexplained flakes on two different specs (`a11y.spec.ts:163`,
 * `session-runner.spec.ts:111`) depending on which fixture happened to be tearing down.
 *
 * This is a diagnostic, not a gate: it changes no threshold and no expectation about GoTrue. A cleanup
 * failure still fails the run, because leaking a user is a real outcome and a loud red beats a quiet one.
 */
export function describeGoTrueFailure(
  stage: 'create' | 'cleanup',
  status: number,
  body: string,
): string {
  const detail = body.trim().slice(0, 500) || '<empty response body>';
  const who = stage === 'create' ? 'create' : 'clean up';
  // "teardown" is said out loud because a cleanup throw is blamed on whichever spec owns the fixture, and
  // the reader's first instinct is to look for a broken assertion in that spec. There isn't one.
  const phase = stage === 'cleanup' ? ' — thrown by teardown, not by an assertion' : '';
  return `Could not ${who} M1-16 test user (${status})${phase}. GoTrue said: ${detail}`;
}
