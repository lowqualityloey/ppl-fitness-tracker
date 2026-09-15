/**
 * M4-05 (#94), acceptance criterion AC-2 — "Secrets stay out".
 *
 * The card demands the proof be "a log-redaction test that is watched to fail
 * against an unredacted injection". Cases 1 and 2 are that proof: written
 * before the fix, they failed against the shipped seam — top-level denied keys
 * were renamed by `safeKey` but their VALUES still went through plain
 * `sanitize`, so `log.error(..., { code })` emitted `"code_redacted":"123456"`
 * and a `mutations` array reached the wire with its payload intact. Renaming a
 * key is cosmetic if the value survives; the marker must replace the value.
 * Both cases carry the watched-red note in place, in the
 * `tests/integration/api/gotrue-failure.test.ts` house style.
 *
 * Scope of each case: the three mechanisms of `lib/logger/redact.ts` must hold
 * through the real `log` export — deny-listed KEYS (top-level and nested),
 * secret SHAPES under innocent keys (JWT, email, URL query), and structural
 * CAPS — and the last case pins the opposite failure mode: an over-redacting
 * seam that eats the diagnostic fields this card exists to produce.
 *
 * Every case logs at `error` so `LOG_LEVEL` cannot silence it, per the capture
 * contract in `logger.test.ts`. Run:
 * `npm test -- tests/unit/infra/log-redaction.test.ts`
 */

import { afterEach, describe, expect, it } from 'vitest';
import { log, setLogSink } from '../../../lib/logger';

const MARKER = '[redacted:denied-key]';
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6ImF0dCJ9.eyJzdWIiOiJhdGhsZXRlLXVzZXItaWQifQ.dmFrZWQtc2lnbmF0dXJlLXZhbHVl';

const restores: Array<() => void> = [];

function capture(): { lines: string[] } {
  const lines: string[] = [];
  restores.push(setLogSink((line) => {
    lines.push(line);
  }));
  return { lines };
}

/** The single wire object the last log call produced, and its raw text. */
function wire(captured: { lines: string[] }): Record<string, unknown> {
  expect(captured.lines).toHaveLength(1);
  const raw = captured.lines[0]!;
  expect(JSON.parse(raw) as Record<string, unknown>).toBeTypeOf('object');
  return JSON.parse(raw) as Record<string, unknown>;
}

afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

describe('AC-2: nothing secret reaches the wire through the real log export', () => {
  it('refuses a credential under a top-level denied key, value included', () => {
    // Watched red against the unredacted injection: this line emitted
    // `"code_redacted":"123456","otp_redacted":"654321"` before `buildEntry`
    // consulted `isDeniedKey` itself. Reverting that one lookup re-fails this.
    const captured = capture();
    log.error('confirm hop received', { code: '123456', otp: '654321', password: 'hunter2' });
    const entry = wire(captured);
    expect(entry['code_redacted']).toBe(MARKER);
    expect(entry['otp_redacted']).toBe(MARKER);
    expect(entry['password_redacted']).toBe(MARKER);
    for (const secret of ['123456', '654321', 'hunter2']) {
      expect(captured.lines[0]).not.toContain(secret);
    }
  });

  it('refuses a payload under a top-level denied key without projecting it', () => {
    // Watched red: the array survived as
    // `"mutations_redacted":[{"weightKg":100,"exerciseId":"bench-press"}]`.
    const captured = capture();
    log.info('sync batch arrived', {
      mutations: [{ exerciseId: 'bench-press', weightKg: 100, reps: 5 }],
      body: { sessionId: 'abc', rows: [{ note: 'squat 90kg' }] },
    });
    const entry = wire(captured);
    expect(entry['mutations_redacted']).toBe(MARKER);
    expect(entry['body_redacted']).toBe(MARKER);
    for (const payload of ['bench-press', 'weightKg', 'squat 90kg', 'sessionId']) {
      expect(captured.lines[0]).not.toContain(payload);
    }
  });

  it('keeps the marker path for nested denied keys', () => {
    const captured = capture();
    log.error('verification failed', { request: { email: 'athlete@example.com', code: '123456', userId: 'u-77' } });
    const request = wire(captured)['request'] as Record<string, unknown>;
    expect(request['emailRedacted']).toBe(MARKER);
    expect(request['codeRedacted']).toBe(MARKER);
    expect(request['userId']).toBe('u-77'); // the correlation key is not a secret
  });

  it('scrubs a JWT shape under a key that never made the list', () => {
    const captured = capture();
    log.warn('upstream rejected', { tokenish: JWT, fingerprint: 'stable-value' });
    const entry = wire(captured);
    expect(entry['tokenish']).toBe('[redacted:jwt]');
    expect(captured.lines[0]).not.toContain('dmFrZWQtc2lnbmF0dXJl');
    expect(entry['fingerprint']).toBe('stable-value');
  });

  it('scrubs an email address embedded in a sentence and in the message itself', () => {
    const captured = capture();
    log.error('contact athlete@example.com refused the mailto', { note: 'reply to athlete+alt@example.com' });
    expect(wire(captured)['msg']).toBe('contact [redacted:email] refused the mailto');
    expect(captured.lines[0]).not.toContain('athlete@');
    expect((wire(captured)['note'] as string)).toContain('[redacted:email]');
  });

  // Found by M4-06 (#95), which is the first consumer to put an error *message* on a
  // third party's wire: Sentry receives what `scrubString` approved. An exception
  // text almost always names the URL that failed it *inside a sentence*, and the
  // predicate's URL rule was anchored to the start of the value — so a GoTrue verify
  // link pasted mid-message kept its `access_token`. The whole-value case below was
  // always green; this one was red against `main` and is why the predicate now scans
  // URLs wherever they sit.
  it('strips a credential from a URL embedded in the middle of a sentence', () => {
    const captured = capture();
    log.error(
      'verify https://proj.supabase.co/auth/v1/verify?access_token=SECRET-IN-SENTENCE failed',
    );
    const msg = wire(captured)['msg'] as string;
    expect(msg).toContain('https://proj.supabase.co/auth/v1/verify');
    expect(msg).toContain('?[redacted:query]');
    expect(msg).not.toContain('SECRET-IN-SENTENCE');
    expect(captured.lines[0]).not.toContain('SECRET-IN-SENTENCE');
  });

  it('keeps a URL diagnosable but strips the credential its query carries', () => {
    const captured = capture();
    log.info('handing off', {
      callbackUrl: 'https://proj.supabase.co/auth/v1/verify?token=abc123def&next=%2Ftoday',
    });
    const url = wire(captured)['callback_url'] as string;
    expect(url).toBe('https://proj.supabase.co/auth/v1/verify?[redacted:query]');
    expect(captured.lines[0]).not.toContain('abc123def');
  });

  it('names an Error without dumping its stack or its denied-key value', () => {
    const err = Object.assign(new Error('deleting athlete@example.com failed'), { code: '1003' });
    const captured = capture();
    log.error('admin hop failed', { error: err });
    const shaped = wire(captured)['error'] as Record<string, unknown>;
    expect(shaped['name']).toBe('Error');
    expect(shaped['message']).toBe('deleting [redacted:email] failed');
    expect(shaped['errorCode']).toBe('1003'); // visible where it must be, under its non-magic name
    expect(captured.lines[0]).not.toMatch(/at .*logger/); // stack frames never ride
  });

  it('caps are real: a 10 KB value cannot eat the greppable line, nor a cycle the emitter', () => {
    const captured = capture();
    const cyclical: Record<string, unknown> = { name: 'node' };
    cyclical['self'] = cyclical;
    log.info('oversize', { blob: 'x'.repeat(600), graph: cyclical });
    const entry = wire(captured);
    expect(entry['graph']).toEqual({ name: 'node', self: '[circular]' });
    expect(entry['blob'] as string).toMatch(/…\(\+88\)$/);
    expect(captured.lines[0]!.length).toBeLessThan(1024);
  });

  it('redacts on purpose, not everything: the trail fields survive intact', () => {
    const captured = capture();
    log.info('sync mutation rejected', {
      mutationId: '8f14e46f-ceea-467a-97d3-7a51d1f0b1f0',
      routineDay: 4,
      status: 200,
      durationMs: 12.5,
    });
    const entry = wire(captured);
    expect(entry['mutation_id']).toBe('8f14e46f-ceea-467a-97d3-7a51d1f0b1f0');
    expect(entry['routine_day']).toBe(4);
    expect(entry['status']).toBe(200);
    expect(entry['duration_ms']).toBe(12.5);
  });
});
