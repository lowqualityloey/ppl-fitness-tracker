/**
 * M4-06 (#95) — the configuration guard.
 *
 * Three claims this file exists to keep true, because none of them is visible in a
 * feature test and two of them are the card's own boundaries:
 *
 *  - **`DEFERRED-m4-005`: tracing is not in this PR.** A `tracesSampleRate` above 0 is
 *    a scope violation by the spec's words, not a tuning choice, so the rule is
 *    enforced against the *text* of both init files rather than against a runtime
 *    option a reviewer would have to remember to look for.
 *  - **Absent DSN is a supported configuration** (AC-2). The test asserts the SDK is
 *    never initialised and no transport is installed — the branch a personal deploy
 *    without Sentry actually runs.
 *  - **The ingest route is same-origin** — the reason `connect-src` stayed `'self'`.
 *    Asserted against `next.config.ts`, because the CSP card's rule 3 and this app's
 *    policy are only consistent while that option is set.
 *
 * The SDK is mocked, so nothing here can reach a network or need an account: the card
 * asks for "a test transport injected (not a live Sentry account)", and a config test
 * that phoned home would be the first thing to break that promise.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const captureException = vi.fn();
const init = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  init: (options: Record<string, unknown>) => init(options),
  captureException: (error: unknown, hint: unknown) => captureException(error, hint),
}));

const BROWSER_DSN = 'https://publickey@o123456.ingest.sentry.io/7654321';

afterEach(async () => {
  const { setErrorTransport } = await import('../../../lib/errors/reporter');
  setErrorTransport(null);
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

/*
 * The env is always stubbed *empty* and the DSN is passed as the argument, so the
 * module-level `initSentryBrowser()` that Next runs on import is a no-op here and the
 * only `init` call is the one this spec asked for. Stubbing the env to the DSN instead
 * makes the count 2 and the assertion meaningless — measured, not imagined.
 */
async function browserInit(dsn: string | undefined) {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
  const mod = await import('../../../src/instrumentation-client');
  return mod.initSentryBrowser(dsn);
}

async function serverInit(dsn: string | undefined) {
  vi.stubEnv('SENTRY_DSN', '');
  const mod = await import('../../../src/sentry.server.config');
  return mod.initSentryServer(dsn);
}

describe('the SDK init pair is error-sink-only', () => {
  for (const [label, path] of [
    ['browser', 'src/instrumentation-client.ts'],
    ['server', 'src/sentry.server.config.ts'],
  ] as const) {
    it(`${label}: the file that initialises Sentry never mentions a trace rate`, () => {
      const source = readFileSync(path, 'utf8');
      // Matched as an *option*, not as a word: this file pair explains the deferral in
      // prose, and a guard that fires on its own comments is a guard nobody keeps.
      expect(source).not.toMatch(
        /\b(tracesSampleRate|tracePropagationTargets|browserTracingIntegration|replaysSessionSampleRate|replaysOnErrorSampleRate)\s*[:(]/,
      );
    });
  }

  it('declines the SDK’s navigation hook, which is a tracing instrument wearing a warning', () => {
    const source = readFileSync('src/instrumentation-client.ts', 'utf8');
    // Sentry's build prints "ACTION REQUIRED: … export `onRouterTransitionStart`" at
    // this pin. Exporting it instruments navigations, and instrumentation of
    // navigations is signal, not error reporting — DEFERRED-m4-005's boundary. The
    // guard fails the day someone "fixes" the warning without reading the deferral.
    expect(source).not.toMatch(/onRouterTransitionStart\s*=/);
    expect(source).toContain('onRouterTransitionStart'); // the explanation stays present
  });

  it('initialises with a DSN and installs the transport (AC 1’s configuration half)', async () => {
    expect(await browserInit(BROWSER_DSN)).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0]![0] as Record<string, unknown>;
    expect(options.dsn).toBe(BROWSER_DSN);
    expect(options.sendDefaultPii).toBe(false);
    // The absence is the assertion: an explicit `tracesSampleRate: 0` would also pass a
    // "is it > 0?" test while pretending the option had been considered.
    expect(options).not.toHaveProperty('tracesSampleRate');
  });

  it('does the same on the server side', async () => {
    expect(await serverInit(BROWSER_DSN)).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0]![0]).not.toHaveProperty('tracesSampleRate');
  });

  it.each([[BROWSER_DSN], [undefined], [''], ['   ']])('reports the DSN %s as configured?', async (dsn) => {
    const configured = await serverInit(dsn);
    expect(configured).toBe(typeof dsn === 'string' && dsn.trim() !== '');
  });
});

describe('AC-2 — an absent DSN is a supported configuration', () => {
  it('the browser never reaches the SDK and the reporter stays silent', async () => {
    const reporter = await import('../../../lib/errors/reporter');
    reporter.setErrorTransport(null);

    expect(await browserInit(undefined)).toBe(false);
    expect(init).not.toHaveBeenCalled();
    expect(reporter.hasErrorTransport()).toBe(false);

    const events: unknown[] = [];
    const restore = reporter.setErrorTransport((event) => events.push(event));
    expect(() =>
      reporter.reportError(new Error('defect with no sink'), { plane: 'client', source: 'runner' }),
    ).not.toThrow();
    expect(events).toHaveLength(1); // a transport installed by hand still works…
    restore();
    expect(reporter.hasErrorTransport()).toBe(false); // …and nothing was left installed.
  });

  it('a capture against the mocked SDK carries the tags the seam promises', async () => {
    await serverInit(BROWSER_DSN);
    const reporter = await import('../../../lib/errors/reporter');
    reporter.reportError(new Error('server defect'), {
      plane: 'server',
      source: 'route-error:unhandled',
      kind: 'producer',
    });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [, hint] = captureException.mock.calls[0] as [unknown, { tags: Record<string, string> }];
    expect(hint.tags.kind).toBe('producer');
    expect(hint.tags.plane).toBe('server');
    expect(hint.tags.source).toBe('route-error:unhandled');
  });
});

describe('the ingest route is same-origin', () => {
  it('next.config.ts installs the tunnel Sentry ingest depends on for connect-src "self"', () => {
    const source = readFileSync('next.config.ts', 'utf8');
    expect(source).toMatch(/tunnelRoute:\s*'\/monitoring'/);
    expect(source).toMatch(/withSentryConfig\(/);
  });

  it('no policy directive names Sentry any more, and the app’s own origin is the only connect source', async () => {
    const { buildCsp } = await import('../../../lib/http/csp');
    const policy = buildCsp({ nonce: 'n-1', dev: false });
    expect(policy).not.toContain('sentry.io');
    expect(policy).toMatch(/connect-src 'self';/);
  });
});
