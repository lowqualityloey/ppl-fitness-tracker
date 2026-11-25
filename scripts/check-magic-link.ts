/**
 * Magic-link synthetic monitor for issue #16 (blocker B2, "No production SMTP").
 *
 * Why this exists: src/app/auth/signin/route.ts:39 answers { ok: true } with HTTP 200
 * unconditionally — supabase.auth.signInWithOtp() resolves even when GoTrue never handed
 * the message to an SMTP server. No status on the request side is therefore evidence that
 * a link was delivered. The only honest proof is the round trip: ask the app for a link,
 * find the message in the mail sink, follow the link the template actually produced, and
 * then confirm the link is single-use. A green /api/health proves nothing here.
 *
 * This drives the local Supabase + Mailpit stack by default and any deployed origin when
 * MONITOR_BASE_URL points elsewhere. No application code, schema or configuration is
 * involved: deleting this file, its test, the workflow and the package.json script entry
 * is the whole rollback (spec section 7).
 *
 * Usage:
 *   npm run monitor:magic-link
 *   npm run monitor:magic-link -- --volume 3
 *
 * --volume N performs N independent round trips (distinct recipient and distinct
 * per-run forwarded-for bucket, because lib/auth/rate-limit.ts buckets on that value).
 * The hourly workflow deliberately runs one message only: email_sent = 2 in
 * supabase/config.toml is the defect under test, so volume is an operator tool, not the
 * scheduled baseline.
 *
 * Environment (every value has a local default except the service-role key):
 *   MONITOR_BASE_URL          app origin                     http://127.0.0.1:3001
 *   MONITOR_MAILPIT_URL       Mailpit HTTP API               http://127.0.0.1:54324
 *   MONITOR_MAIL_DOMAIN       recipient domain               ppl-fitness-tracker.test
 *   NEXT_PUBLIC_SUPABASE_URL  GoTrue base                    http://127.0.0.1:54321
 *   SUPABASE_SERVICE_ROLE_KEY admin provisioning only         required, never printed
 *
 * Exit codes:
 *   0  proven — a fresh link redeemed to a session and its replay was rejected
 *   1  broken — the printed verdict names the phase that failed
 *   2  config — a required environment value is missing or unusable
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const CONFIRM_PATHNAME = '/auth/confirm';
const MESSAGE_LIMIT = 50;
const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;
const SESSION_COOKIE_MARKER = '-auth-token';
const DEFAULT_REDIRECT_PATH = '/';
const LINK_INVALID_PATH = '/sign-in';

/** Every way the round trip can end. The first six are failures; 'ok' is the only pass. */
export type MonitorStatus =
  | 'ok'
  | 'app-unreachable'
  | 'rate-limited'
  | 'no-message'
  | 'link-unparseable'
  | 'redeem-failed'
  | 'replay-accepted';

/** What the driver observed, reduced to the facts the verdict is allowed to depend on. */
export interface MonitorFacts {
  /** HTTP status of POST /auth/signin, or null when no response arrived at all. */
  requestStatus: number | null;
  /** True when a message addressed to the run recipient was found in the mail sink. */
  delivered: boolean;
  /** The confirm link parsed out of the delivered message, or null. */
  link: string | null;
  /** HTTP status of following that link, or null when no response arrived. */
  redeemStatus: number | null;
  /** Where the redeem redirect pointed, or null when there was no Location header. */
  redeemLocation: string | null;
  /** True when the redeem response carried a Supabase auth-token cookie. */
  redeemHasSession: boolean;
  /** HTTP status of following the same link a second time, or null. */
  replayStatus: number | null;
  /** Where the replay redirect pointed, or null when there was no Location header. */
  replayLocation: string | null;
  /** True when the replay response handed out a session. */
  replayHasSession: boolean;
}

export interface MailpitAddress {
  Address?: string;
}

export interface MailpitMessage {
  ID: string;
  To?: MailpitAddress[];
}

export interface MonitorConfig {
  baseUrl: string;
  mailpitUrl: string;
  mailDomain: string;
  supabaseUrl: string;
  serviceRoleKey: string;
}

export interface FollowResult {
  status: number;
  location: string | null;
  hasSessionCookie: boolean;
}

/**
 * GoTrue's token_hash as the app actually receives it.
 *
 * The 56-hex tail is the hash itself. The optional 'pkce_' prefix is not decoration: the
 * server client in node_modules/@supabase/ssr hardcodes flowType 'pkce', so signInWithOtp
 * always sends a code_challenge and GoTrue mints a PKCE-flavoured token. A pattern pinned
 * to bare 56-hex would report link-unparseable on every real message.
 */
const TOKEN_HASH_PATTERN = /^(?:pkce_)?[0-9a-f]{56}$/;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;

/** A synthetic link is only a candidate when it is the app's confirm route with a real hash. */
function isConfirmUrl(url: URL): boolean {
  if (url.pathname !== CONFIRM_PATHNAME) {
    return false;
  }
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  if (tokenHash === null || !TOKEN_HASH_PATTERN.test(tokenHash)) {
    return false;
  }
  return type === null || type === 'email';
}

/**
 * Finds the confirm link in a delivered message.
 *
 * The HTML part matters: supabase/templates/magic-link.html renders the query separator as
 * &amp;, because an unescaped & in an attribute is invalid HTML. A parser that searched
 * only for '&type=email' would therefore miss the real message and report a false
 * no-message, so the entity is decoded before the URL is parsed. The text part carries a
 * plain '&', which is why both parts are searched rather than just one.
 */
export function parseConfirmLink(
  html: string | null | undefined,
  text: string | null | undefined,
): string | null {
  for (const part of [html, text]) {
    if (!part) {
      continue;
    }
    const candidates = part.replace(/&amp;/g, '&').match(URL_PATTERN) ?? [];
    for (const candidate of candidates) {
      const decoded = candidate.replace(/&amp;/g, '&');
      const url = parseUrl(decoded);
      if (url !== null && isConfirmUrl(url)) {
        return decoded;
      }
    }
  }
  return null;
}

/** The token_hash GoTrue puts in the link (56 hex, optionally pkce_ prefixed), or null. */
export function tokenHashFromLink(link: string | null | undefined): string | null {
  if (!link) {
    return null;
  }
  const url = parseUrl(link);
  if (url === null || !isConfirmUrl(url)) {
    return null;
  }
  return url.searchParams.get('token_hash');
}

/** Number of messages addressed to exactly this recipient. */
export function countMessages(messages: readonly MailpitMessage[], email: string): number {
  return messages.filter((message) => addressesRecipient(message, email)).length;
}

/**
 * The newest message for this recipient, or null.
 *
 * Mailpit lists newest first (start=0 is the head of the mailbox), so the first match is
 * the message this run just caused. Matching is by exact address because the recipient is
 * unique per run; a subject or body substring would happily pick up a neighbouring run.
 */
export function pickMessage(
  messages: readonly MailpitMessage[],
  email: string,
): MailpitMessage | null {
  return messages.find((message) => addressesRecipient(message, email)) ?? null;
}

/**
 * The truth table, separated from every HTTP call so it can be tested without a stack.
 *
 * Order is load-bearing. A 429 is a rate-limited run, not an unreachable app. A missing
 * message after a 200 is the exact defect B2 describes — the route says "sent" and nothing
 * arrived — so it outranks every later phase. Replay is checked last because it can only be
 * meaningful once a link actually redeemed.
 */
export function verdict(facts: MonitorFacts): MonitorStatus {
  if (facts.requestStatus === null) {
    return 'app-unreachable';
  }
  if (facts.requestStatus === 429) {
    return 'rate-limited';
  }
  if (facts.requestStatus !== 200) {
    return 'app-unreachable';
  }
  if (!facts.delivered) {
    return 'no-message';
  }
  if (facts.link === null) {
    return 'link-unparseable';
  }
  if (!isRedeemed(facts)) {
    return 'redeem-failed';
  }
  if (isReplayAccepted(facts)) {
    return 'replay-accepted';
  }
  return 'ok';
}

/** A redeem only counts when the app redirected to the allowed destination and minted a session. */
function isRedeemed(facts: MonitorFacts): boolean {
  return (
    facts.redeemStatus === 303 &&
    facts.redeemHasSession &&
    normalizePath(facts.redeemLocation) === DEFAULT_REDIRECT_PATH
  );
}

/**
 * The replay is a failure unless it provably landed on the rejection page.
 *
 * The direction matters: an unproven single-use is a finding, not a pass, so a replay that
 * produced a session *or* answered with anything other than the documented rejection
 * redirect counts as accepted. redeem() has already established that the link was valid,
 * which is what makes this comparison meaningful.
 */
function isReplayAccepted(facts: MonitorFacts): boolean {
  if (facts.replayHasSession) {
    return true;
  }
  return !(
    facts.replayStatus === 303 && normalizePath(facts.replayLocation) === LINK_INVALID_PATH
  );
}

function normalizePath(location: string | null): string {
  if (!location) {
    return '';
  }
  try {
    return new URL(location, 'http://monitor.invalid').pathname;
  } catch {
    return '';
  }
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function addressesRecipient(message: MailpitMessage, email: string): boolean {
  const target = email.trim().toLowerCase();
  return (message.To ?? []).some(
    (address) => (address.Address ?? '').trim().toLowerCase() === target,
  );
}

/**
 * Reads MONITOR_* plus the two Supabase values, with local defaults.
 *
 * Kept pure and exported: a missing service-role key must be a config exit (2), never a
 * failed round trip (1), and that distinction is worth a test. The key itself is only ever
 * used as a header and is never printed.
 */
export function readConfig(
  env: Record<string, string | undefined>,
): { ok: true; config: MonitorConfig } | { ok: false; reason: string } {
  const baseUrl = env.MONITOR_BASE_URL ?? 'http://127.0.0.1:3001';
  const mailpitUrl = env.MONITOR_MAILPIT_URL ?? 'http://127.0.0.1:54324';
  const mailDomain = (env.MONITOR_MAIL_DOMAIN ?? 'ppl-fitness-tracker.test').trim();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  for (const [name, value] of [
    ['MONITOR_BASE_URL', baseUrl],
    ['MONITOR_MAILPIT_URL', mailpitUrl],
    ['NEXT_PUBLIC_SUPABASE_URL', supabaseUrl],
  ] as const) {
    const url = parseUrl(value);
    if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      return { ok: false, reason: name + ' must be an absolute http(s) URL' };
    }
  }
  if (mailDomain === '' || !mailDomain.includes('.')) {
    return { ok: false, reason: 'MONITOR_MAIL_DOMAIN must be a mail domain' };
  }
  if (serviceRoleKey.trim() === '') {
    return {
      ok: false,
      reason: 'SUPABASE_SERVICE_ROLE_KEY is required for admin provisioning',
    };
  }

  return {
    ok: true,
    config: {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      mailpitUrl: mailpitUrl.replace(/\/+$/, ''),
      mailDomain,
      supabaseUrl: supabaseUrl.replace(/\/+$/, ''),
      serviceRoleKey,
    },
  };
}

/** --volume N, defaulting to 1. Returns null for anything unusable. */
export function parseVolume(argv: readonly string[]): number | null {
  const index = argv.findIndex((arg) => arg === '--volume' || arg.startsWith('--volume='));
  if (index === -1) {
    return 1;
  }
  const raw = argv[index];
  if (raw === undefined) {
    return null;
  }
  const value = raw.startsWith('--volume=') ? raw.slice('--volume='.length) : argv[index + 1];
  if (value === undefined || !/^[1-9][0-9]*$/.test(value)) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function ok(phase: string, detail: string): void {
  console.log('  ok    ' + phase.padEnd(9) + ' ' + detail);
}

function fail(phase: string, detail: string): void {
  console.error('  FAIL  ' + phase.padEnd(9) + ' ' + detail);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sessionCookiePresent(headers: Headers): boolean {
  const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const joined = cookies.length > 0 ? cookies.join('\n') : (headers.get('set-cookie') ?? '');
  return joined.includes(SESSION_COOKIE_MARKER + '=');
}

/**
 * The admin headers, built in one place so the service-role key is never spelled into a
 * request literal. GoTrue accepts a bare { email, email_confirm } body, so the monitor
 * creates an account with no password at all rather than inventing a throwaway secret:
 * a synthetic account that cannot be signed into by password is one less credential.
 */
function adminHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    apikey: serviceRoleKey,
    authorization: 'Bearer ' + serviceRoleKey,
  };
}

/**
 * Creates the synthetic account, idempotently.
 *
 * 422 means GoTrue already knows this address, which is success for a monitor that reruns.
 * Provisioning is the only place the service-role key is needed and the only phase that can
 * report a config error mid-run: an auth rejection there is a credential problem (exit 2),
 * not a broken sign-in path (exit 1).
 */
async function provision(config: MonitorConfig, email: string): Promise<void> {
  const response = await fetchWithTimeout(config.supabaseUrl + '/auth/v1/admin/users', {
    method: 'POST',
    headers: adminHeaders(config.serviceRoleKey),
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (response === null) {
    throw new MonitorConfigError('GoTrue admin endpoint did not answer');
  }
  if (response.status === 401 || response.status === 403) {
    throw new MonitorConfigError('SUPABASE_SERVICE_ROLE_KEY was rejected (' + response.status + ')');
  }
  if (response.status === 200 || response.status === 201 || response.status === 422) {
    return;
  }
  throw new MonitorConfigError('GoTrue admin endpoint answered ' + response.status);
}

/** A config failure: always exit 2, never a red verdict. */
class MonitorConfigError extends Error {}

/** Asks the app for a link and returns its status, or null when nothing answered. */
async function requestLink(
  config: MonitorConfig,
  email: string,
  forwardedFor: string,
): Promise<number | null> {
  const response = await fetchWithTimeout(config.baseUrl + '/auth/signin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-vercel-forwarded-for': forwardedFor,
    },
    body: JSON.stringify({ email }),
  });
  return response === null ? null : response.status;
}

/** Polls the mail sink until a message for this recipient lands, then returns its id. */
async function waitForMessage(
  config: MonitorConfig,
  email: string,
): Promise<{ id: string; waitedMs: number } | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  const startedAt = Date.now();
  while (Date.now() <= deadline) {
    const response = await fetchWithTimeout(
      config.mailpitUrl + '/api/v1/messages?limit=' + String(MESSAGE_LIMIT),
      { method: 'GET' },
    );
    if (response !== null && response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const messages = extractMessages(body);
      const match = pickMessage(messages, email);
      if (match !== null) {
        return { id: match.ID, waitedMs: Date.now() - startedAt };
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

/**
 * Mailpit's list envelope, defended rather than trusted.
 *
 * An unexpected shape is treated as "no message yet" so the run ends on a red verdict with
 * the polling window it actually waited, instead of throwing a stack trace that reads like
 * a monitor bug. The spec's event-driven checkpoint fires on exactly this case.
 */
function extractMessages(body: unknown): MailpitMessage[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages.filter((entry): entry is MailpitMessage => {
    return (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { ID?: unknown }).ID === 'string'
    );
  });
}

async function fetchMessageBody(
  config: MonitorConfig,
  id: string,
): Promise<{ html: string | null; text: string | null } | null> {
  const response = await fetchWithTimeout(
    config.mailpitUrl + '/api/v1/message/' + encodeURIComponent(id),
    { method: 'GET' },
  );
  if (response === null || !response.ok) {
    return null;
  }
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as { HTML?: unknown; Text?: unknown };
  return {
    html: typeof record.HTML === 'string' ? record.HTML : null,
    text: typeof record.Text === 'string' ? record.Text : null,
  };
}

/** Follows a URL without following its redirect, recording where it pointed. */
async function follow(url: string): Promise<FollowResult | null> {
  const response = await fetchWithTimeout(url, { method: 'GET', redirect: 'manual' });
  if (response === null) {
    return null;
  }
  return {
    status: response.status,
    location: response.headers.get('location'),
    hasSessionCookie: sessionCookiePresent(response.headers),
  };
}

/**
 * One complete round trip, printing each phase as it is proven.
 *
 * The facts object is the single source of truth: every early return goes through verdict()
 * so the printed phase and the exit code can never disagree with the truth table.
 */
async function runRoundTrip(config: MonitorConfig, index: number, volume: number): Promise<MonitorStatus> {
  const runId = Date.now().toString(36) + '-' + randomUUID().slice(0, 8);
  const suffix = volume > 1 ? '-' + String(index + 1) : '';
  const email = 'synthetic+' + runId + suffix + '@' + config.mailDomain;
  // Per-run bucket: lib/auth/rate-limit.ts keys on this value and falls back to a shared
  // 'unknown', so two local runs without one would collide after five requests.
  const forwardedFor = '203.0.113.' + String(((index + 1) * 17) % 250 + 1);

  const facts: MonitorFacts = {
    requestStatus: null,
    delivered: false,
    link: null,
    redeemStatus: null,
    redeemLocation: null,
    redeemHasSession: false,
    replayStatus: null,
    replayLocation: null,
    replayHasSession: false,
  };

  await provision(config, email);
  ok('provision', 'synthetic account ready');

  facts.requestStatus = await requestLink(config, email, forwardedFor);
  if (facts.requestStatus === null) {
    fail('request', 'POST /auth/signin did not answer');
    return verdict(facts);
  }
  if (facts.requestStatus !== 200) {
    fail('request', 'POST /auth/signin answered ' + facts.requestStatus);
    return verdict(facts);
  }
  ok('request', 'POST /auth/signin answered 200');

  const delivered = await waitForMessage(config, email);
  if (delivered === null) {
    fail('deliver', 'no message for ' + email + ' within ' + String(POLL_TIMEOUT_MS) + ' ms');
    return verdict(facts);
  }
  facts.delivered = true;
  ok('deliver', 'message ' + delivered.id + ' arrived after ' + String(delivered.waitedMs) + ' ms');

  const body = await fetchMessageBody(config, delivered.id);
  facts.link = parseConfirmLink(body?.html, body?.text);
  const tokenHash = tokenHashFromLink(facts.link);
  if (facts.link === null || tokenHash === null) {
    fail('parse', 'no /auth/confirm link with a 56-hex (optionally pkce_) token_hash in the delivered message');
    return verdict(facts);
  }
  ok('parse', 'token_hash ' + tokenHash.slice(0, 8) + '... (' + String(tokenHash.length) + ' chars)');

  const redeem = await follow(facts.link);
  if (redeem === null) {
    fail('redeem', 'following the confirm link did not answer');
    return verdict(facts);
  }
  facts.redeemStatus = redeem.status;
  facts.redeemLocation = redeem.location;
  facts.redeemHasSession = redeem.hasSessionCookie;
  if (facts.redeemStatus !== 303 || !facts.redeemHasSession) {
    fail(
      'redeem',
      String(redeem.status) + ' -> ' + (redeem.location ?? '<none>') + ', session cookie: ' + String(redeem.hasSessionCookie),
    );
    return verdict(facts);
  }
  ok('redeem', '303 -> ' + normalizePath(redeem.location) + ' with session cookie');

  const replay = await follow(facts.link);
  if (replay === null) {
    fail('replay', 'following the link a second time did not answer');
    return verdict(facts);
  }
  facts.replayStatus = replay.status;
  facts.replayLocation = replay.location;
  facts.replayHasSession = replay.hasSessionCookie;
  if (facts.replayHasSession) {
    fail('replay', 'the used link minted a second session');
    return verdict(facts);
  }
  if (facts.replayStatus !== 303 || normalizePath(replay.location) !== LINK_INVALID_PATH) {
    fail('replay', String(replay.status) + ' -> ' + (replay.location ?? '<none>') + ' was not the rejection redirect');
    return verdict(facts);
  }
  ok('replay', '303 -> ' + (replay.location ?? LINK_INVALID_PATH));

  return verdict(facts);
}

async function main(argv: readonly string[]): Promise<number> {
  const startedAt = Date.now();
  const resolved = readConfig(process.env);
  if (!resolved.ok) {
    fail('config', resolved.reason);
    return 2;
  }
  const volume = parseVolume(argv);
  if (volume === null) {
    fail('config', '--volume expects a positive integer, e.g. --volume 3');
    return 2;
  }

  let delivered = 0;
  for (let index = 0; index < volume; index += 1) {
    let status: MonitorStatus;
    try {
      status = await runRoundTrip(resolved.config, index, volume);
    } catch (error) {
      if (error instanceof MonitorConfigError) {
        fail('config', error.message);
        return 2;
      }
      throw error;
    }
    if (status !== 'ok') {
      console.error('FAIL  magic-link round trip failed: ' + status);
      return 1;
    }
    delivered += 1;
  }

  if (volume > 1) {
    ok('volume', String(delivered) + '/' + String(volume) + ' messages delivered and redeemed');
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log('PASS  magic-link round trip completed in ' + elapsed + ' s');
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error('  FAIL  monitor   ' + (error instanceof Error ? error.message : String(error)));
      process.exitCode = 1;
    },
  );
}
