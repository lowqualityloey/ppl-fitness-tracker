/**
 * M4-05 (#94): the redaction rules of the logging seam, isolated so the policy is
 * one readable list rather than a scattering of conditionals.
 *
 * Why this exists at all: M3-10 root-caused a sync defect by reading logs that
 * recorded nothing but timestamps, and the obvious overcorrection — start logging
 * request bodies — would move the privacy problem from "untraceable" to
 * "leaking". The card's answer is both at once: trace everything, name it with
 * ids, and refuse payload content at the seam. A caller cannot forget to redact
 * what the seam will not carry.
 *
 * Three independent mechanisms, because they fail differently:
 *   1. deny-listed **keys** (`email`, `code`, `authorization`, `payload`, …) are
 *      dropped, so an honest `log.info('otp requested', { email })` emits nothing
 *      but a marker;
 *   2. value **shapes** are scrubbed even under innocent keys — a JWT in a field
 *      called `tokenish`, an address inside a sentence, a GoTrue URL whose query
 *      string *is* the credential;
 *   3. structural **caps** (depth, breadth, string length, cycles) keep a line
 *      parseable by whatever greps it, which an unguarded `JSON.stringify` of a
 *      Drizzle row graph does not.
 *
 * Note `errorCode` (see `logger.ts`): the app's error code is deliberately not
 * logged under `code`, because `code` is the magic-link credential's parameter
 * name and this seam must not learn to distinguish them at runtime.
 */

/** Compared after normalization: lowercased, every non-alphanumeric removed. */
const DENIED_KEYS: ReadonlySet<string> = new Set([
  // Transport secrets.
  'cookie', 'cookies', 'setcookie', 'setcookieheaders', 'authorization', 'headers',
  // Credentials, in every spelling this codebase already uses.
  'password', 'passwd', 'secret', 'clientsecret', 'token', 'accesstoken', 'refreshtoken',
  'idtoken', 'authtoken', 'apikey', 'anonkey', 'servicerolekey', 'servicekey',
  'code', 'codeverifier', 'codechallenge', 'otp', 'confirmationtoken', 'confirmationcode',
  'emailotp', 'verifyhash', 'signincode', 'magiclink', 'redirectto',
  // Identity and contact addresses: a user id is the correlation key here, never an email.
  'email', 'useremail', 'phonenumber', 'phone',
  // Payload content — the half the card forbids: "never user payload content".
  'payload', 'requestbody', 'body', 'mutations', 'mutationpayload', 'rows', 'record',
  'values', 'raw', 'stack',
]);

export const REDACTED_BY_KEY = '[redacted:denied-key]';
const REDACTED_JWT = '[redacted:jwt]';
const REDACTED_EMAIL = '[redacted:email]';

/** Cap a logged string: long enough to diagnose, short enough to keep one line. */
export const MAX_STRING_LENGTH = 512;
export const MAX_DEPTH = 4;
export const MAX_ARRAY_ITEMS = 16;
export const MAX_OBJECT_KEYS = 32;

const JWT_SHAPE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
const EMAIL_SHAPE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const BEARER_PREFIX = /^(bearer|basic)\s+\S+/i;

/** `refreshToken`, `refresh_token`, `Refresh-Token` and `refresh token` are one key. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isDeniedKey(key: string): boolean {
  return DENIED_KEYS.has(normalizeKey(key));
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…(+${value.length - MAX_STRING_LENGTH})`;
}

/**
 * Scrub the shapes that are secrets regardless of the key that carried them.
 * Order matters: a URL is reduced to its origin+path *first*, so a token sitting
 * in a query string never reaches the email/JWT scanners as a live substring.
 */
export function scrubString(value: string): string {
  let out = value;

  if (SCHEME.test(out)) {
    const hashAt = out.indexOf('#');
    if (hashAt !== -1) out = out.slice(0, hashAt);
    const queryAt = out.indexOf('?');
    if (queryAt !== -1) out = `${out.slice(0, queryAt)}?[redacted:query]`;
  }

  if (BEARER_PREFIX.test(out) || JWT_SHAPE.test(out.trim())) return REDACTED_JWT;
  out = out.replace(EMAIL_SHAPE, REDACTED_EMAIL);
  return truncate(out);
}


export type SafeValue =
  | string
  | number
  | boolean
  | null
  | SafeValue[]
  | { [key: string]: SafeValue };

/**
 * Depth-capped, cycle-safe, deny-listed projection of an arbitrary value.
 *
 * Never throws: a logger that can throw while a request is already failing turns
 * one defect into two, which is why an unmappable value degrades to a marker
 * string rather than to an exception.
 */
export function sanitize(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): SafeValue {
  if (value === null) return null;

  switch (typeof value) {
    case 'string':
      return scrubString(value);
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
      return value.toString();
    case 'function':
      return `[function ${value.name || 'anonymous'}]`;
    case 'symbol':
    case 'undefined':
      return String(value);
    default:
      break;
  }

  if (value instanceof Date) return value.toISOString();

  if (seen.has(value as object)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[max-depth]';
  seen.add(value as object);

  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((item) => sanitize(item, depth + 1, seen));
      if (value.length > MAX_ARRAY_ITEMS) {
        items.push(`…(+${value.length - MAX_ARRAY_ITEMS} more)`);
      }
      return items;
    }

    if (value instanceof Error) {
      // `stack` is denied as a key and omitted as a value: it is the one field
      // that reliably carries request data in a query built frame by frame, and
      // the trail this card exists to produce wants the failure named, not dumped.
      const shaped: { [key: string]: SafeValue } = {
        name: scrubString(value.name || 'Error'),
        message: scrubString(value.message),
      };
      const withHints = value as Error & { status?: unknown; code?: unknown };
      if (typeof withHints.status === 'number') shaped.status = withHints.status;
      if (typeof withHints.code === 'string') shaped.errorCode = scrubString(withHints.code);
      return shaped;
    }

    const toJSON = (value as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === 'function') return sanitize(toJSON.call(value), depth + 1, seen);

    const out: { [key: string]: SafeValue } = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, entry] of entries.slice(0, MAX_OBJECT_KEYS)) {
      out[safeKey(key)] = isDeniedKey(key) ? REDACTED_BY_KEY : sanitize(entry, depth + 1, seen);
    }
    if (entries.length > MAX_OBJECT_KEYS) {
      out['…'] = `+${entries.length - MAX_OBJECT_KEYS} more keys`;
    }
    return out;
  } finally {
    seen.delete(value as object);
  }
}

/**
 * A denied key still appears — visibly. A silently absent field is a debugging
 * hole, and "the logger ate it" is the exact mystery #125 closed for the shed
 * path; `email` becomes `emailRedacted: "[redacted:denied-key]"` instead.
 */
export function safeKey(key: string): string {
  return isDeniedKey(key) ? `${key}Redacted` : key;
}
