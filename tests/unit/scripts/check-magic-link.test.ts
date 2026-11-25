/**
 * Unit coverage for the magic-link monitor's decision logic (issue #16, blocker B2).
 *
 * Everything here is pure: no stack, no sockets, no mail sink. That is deliberate, because
 * the parts worth pinning down are the judgements, not the I/O. The script itself is
 * exercised against a live Mailpit by the operator (and by the hourly workflow); what this
 * file proves is that the verdicts it can print mean what the spec says they mean.
 *
 * The escaped-&amp; case is the sharpest of these. supabase/templates/magic-link.html renders
 * the query separator as &amp; because a bare & in an attribute is invalid HTML, so a parser
 * tuned to '&type=email' would miss every real message and the monitor would report a false
 * no-message — the one failure mode that looks exactly like the defect it exists to detect.
 */
import { describe, expect, it } from 'vitest';
import {
  countMessages,
  parseConfirmLink,
  parseVolume,
  pickMessage,
  readConfig,
  tokenHashFromLink,
  verdict,
} from '../../../scripts/check-magic-link';

// 56 hex characters: the hash GoTrue hands the template. The length is asserted below so
// a fixture edit cannot quietly stop matching what the app actually sends.
const TOKEN_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678abcdef0123456789';
// The live stack prefixes 'pkce_', because @supabase/ssr hardcodes flowType 'pkce' and so
// every signInWithOtp carries a code_challenge. Verified against the running stack: a
// pkce_ token is accepted by POST /auth/v1/verify. Bare 56-hex is kept as the other shape.
const PKCE_TOKEN_HASH = 'pkce_' + TOKEN_HASH;
const CONFIRM_LINK =
  'http://127.0.0.1:3001/auth/confirm?token_hash=' + TOKEN_HASH + '&type=email';

describe('parseConfirmLink', () => {
  it('finds the link in the HTML part even though the separator is escaped', () => {
    // This is the shape the real template produces, entity and all. If this assertion ever
    // fails, every scheduled run is a false no-message while mail is actually being sent.
    const html =
      '<p><a href="http://127.0.0.1:3001/auth/confirm?token_hash=' +
      TOKEN_HASH +
      '&amp;type=email">Sign in</a></p>';
    expect(parseConfirmLink(html, null)).toBe(CONFIRM_LINK);
  });

  it('finds the link in the plain-text part, where the separator is unescaped', () => {
    const text = 'Follow this link to sign in:\n\n  ' + CONFIRM_LINK + '\n\nExpires in 1 hour.';
    expect(parseConfirmLink(null, text)).toBe(CONFIRM_LINK);
  });

  it('ignores an unrelated link that also survives HTML escaping', () => {
    // The negative case: a message that mentions the tracker but carries no confirm link.
    // Returning the tracker URL here would make the monitor follow the wrong thing and
    // report a redeem failure against a healthy mail path.
    const html =
      '<p>Your plan is ready. <a href="https://ppl-fitness-tracker.test/plan?week=12&amp;day=3">Open</a></p>';
    expect(parseConfirmLink(html, null)).toBeNull();
  });

  it('rejects a lookalike confirm URL whose token_hash is not 56 hex characters', () => {
    const html = '<a href="http://127.0.0.1:3001/auth/confirm?token_hash=short&type=email">x</a>';
    expect(parseConfirmLink(html, null)).toBeNull();
  });

  it('finds a pkce_ prefixed link, which is what the live stack actually delivers', () => {
    // This case is the reason the pattern was widened. Before it, the monitor reported
    // link-unparseable against a perfectly good message on every run of the real stack.
    const html =
      '<a href="http://127.0.0.1:3001/auth/confirm?token_hash=' +
      PKCE_TOKEN_HASH +
      '&amp;type=email">Sign in</a>';
    expect(parseConfirmLink(html, null)).toBe(
      'http://127.0.0.1:3001/auth/confirm?token_hash=' + PKCE_TOKEN_HASH + '&type=email',
    );
  });

  it('still rejects a pkce_ prefix wrapped around the wrong hash length', () => {
    // Widening the prefix must not turn into accepting anything that starts with pkce_.
    const html =
      '<a href="http://127.0.0.1:3001/auth/confirm?token_hash=pkce_deadbeef&type=email">x</a>';
    expect(parseConfirmLink(html, null)).toBeNull();
  });

  it('rejects a confirm URL for a different link type', () => {
    const html =
      '<a href="http://127.0.0.1:3001/auth/confirm?token_hash=' + TOKEN_HASH + '&type=recovery">x</a>';
    expect(parseConfirmLink(html, null)).toBeNull();
  });

  it('returns null when neither part carries a body', () => {
    expect(parseConfirmLink(null, undefined)).toBeNull();
    expect(parseConfirmLink('', '')).toBeNull();
  });

  it('prefers the HTML part when both parts carry the link', () => {
    const html = '<a href="' + CONFIRM_LINK.replace('&', '&amp;') + '">a</a>';
    expect(parseConfirmLink(html, CONFIRM_LINK)).toBe(CONFIRM_LINK);
  });
});

describe('tokenHashFromLink', () => {
  it('extracts the 56-hex hash the template put in the link', () => {
    expect(TOKEN_HASH).toHaveLength(56);
    expect(tokenHashFromLink(CONFIRM_LINK)).toBe(TOKEN_HASH);
  });

  it('extracts a pkce_ hash whole, prefix included', () => {
    // The prefix is part of the value GoTrue must be handed back; truncating it would send
    // a different token and turn a working link into a redeem failure.
    const link =
      'http://127.0.0.1:3001/auth/confirm?token_hash=' + PKCE_TOKEN_HASH + '&type=email';
    expect(tokenHashFromLink(link)).toBe(PKCE_TOKEN_HASH);
  });

  it('returns null for a non-confirm URL, so a stray link cannot be read as a hash', () => {
    expect(tokenHashFromLink('http://127.0.0.1:3001/plan?token_hash=' + TOKEN_HASH)).toBeNull();
  });

  it('returns null for empty and malformed input instead of throwing', () => {
    expect(tokenHashFromLink(null)).toBeNull();
    expect(tokenHashFromLink(undefined)).toBeNull();
    expect(tokenHashFromLink('')).toBeNull();
    expect(tokenHashFromLink('not a url')).toBeNull();
  });
});

describe('countMessages and pickMessage', () => {
  const messages = [
    { ID: 'newest', To: [{ Address: 'Synthetic+Run1@ppl-fitness-tracker.test' }] },
    { ID: 'other', To: [{ Address: 'someone-else@ppl-fitness-tracker.test' }] },
    { ID: 'older', To: [{ Address: 'synthetic+run1@ppl-fitness-tracker.test' }] },
  ];

  it('counts only messages addressed to this exact recipient, case-insensitively', () => {
    // Exact-address matching is what keeps a neighbouring run's message out of this run.
    expect(countMessages(messages, 'synthetic+run1@ppl-fitness-tracker.test')).toBe(2);
    expect(countMessages(messages, 'someone-else@ppl-fitness-tracker.test')).toBe(1);
  });

  it('returns zero for an address that received nothing', () => {
    expect(countMessages(messages, 'synthetic+absent@ppl-fitness-tracker.test')).toBe(0);
  });

  it('picks the newest match, because Mailpit lists the head of the mailbox first', () => {
    expect(pickMessage(messages, 'synthetic+run1@ppl-fitness-tracker.test')?.ID).toBe('newest');
  });

  it('returns null rather than a wrong message when nothing matches', () => {
    expect(pickMessage(messages, 'synthetic+absent@ppl-fitness-tracker.test')).toBeNull();
  });

  it('survives messages whose To list is missing', () => {
    expect(countMessages([{ ID: 'bare' }], 'synthetic+run1@ppl-fitness-tracker.test')).toBe(0);
  });
});

describe('verdict', () => {
  const proven = {
    requestStatus: 200,
    delivered: true,
    link: CONFIRM_LINK,
    redeemStatus: 303,
    redeemLocation: '/',
    redeemHasSession: true,
    replayStatus: 303,
    replayLocation: '/sign-in?error=link-invalid-or-expired',
    replayHasSession: false,
  };

  it('returns ok only when the link redeemed to a session and the replay was rejected', () => {
    expect(verdict(proven)).toBe('ok');
  });

  it('returns app-unreachable when the app never answered', () => {
    expect(verdict({ ...proven, requestStatus: null })).toBe('app-unreachable');
  });

  it('returns app-unreachable for a non-200 answer that is not a rate limit', () => {
    // 500 is the shape a failed signInWithOtp produces once the route stops swallowing it;
    // it must never be mistaken for a rate limit, whose remedy is entirely different.
    expect(verdict({ ...proven, requestStatus: 500 })).toBe('app-unreachable');
  });

  it('returns rate-limited for a 429', () => {
    expect(verdict({ ...proven, requestStatus: 429 })).toBe('rate-limited');
  });

  it('returns no-message when the request answered 200 and nothing was delivered', () => {
    // AC-6: this is the B2 defect itself — the route says "sent" and the mailbox stays empty.
    expect(verdict({ ...proven, requestStatus: 200, delivered: false })).toBe('no-message');
  });

  it('returns link-unparseable when the message arrived without a confirm link', () => {
    expect(verdict({ ...proven, link: null })).toBe('link-unparseable');
  });

  it('returns redeem-failed when the confirm link did not mint a session', () => {
    expect(verdict({ ...proven, redeemStatus: 303, redeemHasSession: false })).toBe('redeem-failed');
  });

  it('returns redeem-failed when the confirm link answered with a non-redirect', () => {
    expect(verdict({ ...proven, redeemStatus: 400 })).toBe('redeem-failed');
  });

  it('returns redeem-failed when the redeem landed on the rejection page rather than the app', () => {
    // A 303 alone is not proof of sign-in: the app also 303s to its error page when
    // verifyOtp rejects the hash. Only the destination separates those two outcomes.
    expect(
      verdict({
        ...proven,
        redeemLocation: '/sign-in?error=link-invalid-or-expired',
        redeemHasSession: false,
      }),
    ).toBe('redeem-failed');
  });

  it('returns replay-accepted when the used link handed out a second session', () => {
    expect(verdict({ ...proven, replayHasSession: true })).toBe('replay-accepted');
  });

  it('returns replay-accepted when the replay redirected to the success destination', () => {
    expect(verdict({ ...proven, replayLocation: '/' })).toBe('replay-accepted');
  });

  it('returns replay-accepted when the replay answer proves nothing about single use', () => {
    // Fail closed: only the documented rejection redirect counts as proof. A 400 with no
    // Location is not evidence the link was refused, so it must not be reported as a pass.
    expect(
      verdict({ ...proven, replayStatus: 400, replayLocation: null, replayHasSession: false }),
    ).toBe('replay-accepted');
  });

  it('treats a delivered-but-unrequested message as no-message, not as a failed delivery', () => {
    // Ordering guard: requestStatus is checked before delivery, so a 429 with a message from
    // an earlier run still reads as rate-limited rather than as a successful round trip.
    expect(verdict({ ...proven, requestStatus: 429, delivered: false })).toBe('rate-limited');
  });
});

describe('readConfig', () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
  };

  it('accepts the local defaults with only the Supabase values supplied', () => {
    const resolved = readConfig(env);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.baseUrl).toBe('http://127.0.0.1:3001');
      expect(resolved.config.mailpitUrl).toBe('http://127.0.0.1:54324');
      expect(resolved.config.mailDomain).toBe('ppl-fitness-tracker.test');
    }
  });

  it('treats a missing service-role key as a config error, never as a broken round trip', () => {
    // Exit 2 rather than exit 1: a monitor that reports "sign-in is broken" when its own
    // credential is absent is worse than one that reports nothing.
    const resolved = readConfig({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toContain('SUPABASE_SERVICE_ROLE_KEY');
    }
  });

  it('rejects a relative base URL instead of silently fetching a path', () => {
    const resolved = readConfig({ ...env, MONITOR_BASE_URL: '/api' });
    expect(resolved.ok).toBe(false);
  });

  it('strips trailing slashes so paths are never doubled', () => {
    const resolved = readConfig({ ...env, MONITOR_BASE_URL: 'http://127.0.0.1:3001/' });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.baseUrl).toBe('http://127.0.0.1:3001');
    }
  });
});

describe('parseVolume', () => {
  it('defaults to one message, because email_sent = 2 is the defect under test', () => {
    expect(parseVolume([])).toBe(1);
  });

  it('accepts both --volume N and --volume=N', () => {
    expect(parseVolume(['--volume', '3'])).toBe(3);
    expect(parseVolume(['--volume=3'])).toBe(3);
  });

  it('rejects zero, negatives, fractions and a missing value', () => {
    expect(parseVolume(['--volume', '0'])).toBeNull();
    expect(parseVolume(['--volume', '-1'])).toBeNull();
    expect(parseVolume(['--volume', '1.5'])).toBeNull();
    expect(parseVolume(['--volume'])).toBeNull();
    expect(parseVolume(['--volume='])).toBeNull();
  });
});
