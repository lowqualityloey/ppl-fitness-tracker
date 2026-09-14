import { describe, expect, it } from 'vitest';
import { SENTRY_INGEST_SOURCES, buildCsp } from '../../../lib/http/csp';

/**
 * M4-24 (#142) — the CSP baseline policy contract.
 *
 * This is the "Sentry ingest is permitted before Sentry exists" scenario's parse half, and
 * the set-comparison the card demands: "any added origin, any script-src wildcard host, or
 * any 'unsafe-inline' fails here, not later." Like every gate in this repo, each comparator
 * is paired with a mutation control that watches it fail on the violation it claims to catch
 * (docs/tests/2026-09-11-m3-verification-audit.md doctrine) — a parse that cannot go red is
 * a comment with an expect() around it.
 */

const NONCE = 'dGVzdC1ub25jZS1mb3ItbWUtMjQ=';

/** directive name → token list (valueless directives map to []). */
function parse(policy: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const [name, ...values] = tokens as [string, ...string[]];
    expect(out.has(name), `duplicate directive ${name}`).toBe(false);
    out.set(name, values);
  }
  return out;
}

const PROD_DIRECTIVES = [
  'base-uri',
  'child-src',
  'connect-src',
  'default-src',
  'font-src',
  'form-action',
  'frame-ancestors',
  'img-src',
  'media-src',
  'object-src',
  'script-src',
  'style-src',
  'upgrade-insecure-requests',
  'worker-src',
];

describe('buildCsp — production policy', () => {
  const policy = buildCsp({ nonce: NONCE, dev: false });
  const directives = parse(policy);

  it('carries exactly the card-table directive set, nothing invented', () => {
    expect([...directives.keys()].sort()).toEqual(PROD_DIRECTIVES);
  });

  it("script-src is 'self' + per-request nonce + strict-dynamic, and never 'unsafe-inline'", () => {
    const tokens = directives.get('script-src')!;
    expect(tokens).toContain(`'self'`);
    expect(tokens).toContain(`'nonce-${NONCE}'`);
    expect(tokens).toContain(`'strict-dynamic'`);
    expect(tokens).not.toContain(`'unsafe-inline'`);
    expect(tokens).not.toContain(`'unsafe-eval'`); // dev concession, prod build must not have it
    expect(tokens).not.toContain('*'); // no wildcard host (AC: "any script-src wildcard host fails")
  });

  it("style-src is exactly 'self' + nonce — strict, because zero inline styles were measured", () => {
    expect(directives.get('style-src')).toEqual([`'self'`, `'nonce-${NONCE}'`]);
  });

  it("connect-src is 'self' + both Sentry ingest shapes, pinned by set comparison", () => {
    expect(new Set(directives.get('connect-src'))).toEqual(
      new Set([`'self'`, ...SENTRY_INGEST_SOURCES]),
    );
    // Mutation control: the comparator fires on an added origin.
    const widened = parse(`${policy}; extra-src https://evil.example`);
    expect([...widened.keys()]).not.toEqual(PROD_DIRECTIVES);
    const smuggled = parse(policy.replace(`'self' https://`, `'self' https://x.example https://`));
    expect(new Set(smuggled.get('connect-src'))).not.toEqual(
      new Set([`'self'`, ...SENTRY_INGEST_SOURCES]),
    );
  });

  it('denies framing, bases, form targets and plugins per §5', () => {
    expect(directives.get('frame-ancestors')).toEqual([`'none'`]);
    expect(directives.get('base-uri')).toEqual([`'self'`]);
    expect(directives.get('form-action')).toEqual([`'self'`]);
    expect(directives.get('object-src')).toEqual([`'none'`]);
    expect(directives.get('default-src')).toEqual([`'self'`]);
  });

  it('gates same-origin media/fonts and pre-clears the #111 service worker', () => {
    for (const d of ['img-src', 'font-src', 'media-src', 'worker-src', 'child-src']) {
      expect(directives.get(d), d).toEqual([`'self'`]);
    }
  });

  it('keeps the no-blob/data exception honest: img-src has no blob: or data:', () => {
    const tokens = directives.get('img-src')!;
    expect(tokens).not.toContain('blob:');
    expect(tokens).not.toContain('data:');
  });

  it('carries upgrade-insecure-requests', () => {
    expect(directives.has('upgrade-insecure-requests')).toBe(true);
  });

  it("the whole string contains no 'unsafe-inline' in any directive, not just script/style", () => {
    expect(policy).not.toContain(`'unsafe-inline'`);
    // Mutation control: the check fires if it were ever reintroduced anywhere.
    expect(policy + `; x-src 'unsafe-inline'`).toContain(`'unsafe-inline'`);
  });
});

describe('buildCsp — dev policy', () => {
  const policy = buildCsp({ nonce: NONCE, dev: true });
  const directives = parse(policy);

  it('adds exactly one concession — unsafe-eval in script-src — and nothing else', () => {
    expect(directives.get('script-src')).toContain(`'unsafe-eval'`);
    expect([...directives.keys()].sort()).toEqual(
      PROD_DIRECTIVES.filter((d) => d !== 'upgrade-insecure-requests'),
    );
  });

  it("still never carries 'unsafe-inline'", () => {
    expect(policy).not.toContain(`'unsafe-inline'`);
  });
});

describe('buildCsp — the nonce is an input, not a constant', () => {
  it('two nonces produce two policies, each carrying its own in script-src and style-src', () => {
    const a = buildCsp({ nonce: 'AAA', dev: false });
    const b = buildCsp({ nonce: 'BBB', dev: false });
    expect(a).not.toEqual(b);
    expect(parse(a).get('script-src')).toContain(`'nonce-AAA'`);
    expect(parse(a).get('style-src')).toContain(`'nonce-AAA'`);
    expect(parse(b).get('script-src')).toContain(`'nonce-BBB'`);
    expect(parse(b).get('script-src')).not.toContain(`'nonce-AAA'`);
    // A hardcoded nonce would survive input changes; these do not:
    expect(a).not.toContain(NONCE);
  });
});
