import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '../../lib/auth/redirect-allowlist.js';
import { AuthRateLimiter } from '../../lib/auth/rate-limit.js';

describe('M1-13: auth redirect allowlist and sign-in limiter', () => {
  it('accepts only the current in-app root path', () => {
    expect(safeRedirectPath('/')).toBe('/');
    for (const candidate of [
      null,
      '',
      '/sign-in',
      '/?next=anything',
      '/#fragment',
      'https://evil.example.com',
      '//evil.example.com',
      'javascript:alert(1)',
      '/%2f%2fevil.example.com',
    ]) {
      expect(safeRedirectPath(candidate)).toBe('/');
    }
  });

  it('rate limits repeated requests from one IP independently of other IPs', () => {
    let now = 1_000;
    const limiter = new AuthRateLimiter(2, 1_000, () => now);

    expect(limiter.check('203.0.113.1').allowed).toBe(true);
    expect(limiter.check('203.0.113.1').allowed).toBe(true);
    expect(limiter.check('203.0.113.1')).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.check('203.0.113.2').allowed).toBe(true);

    now += 1_001;
    expect(limiter.check('203.0.113.1').allowed).toBe(true);
  });
});
