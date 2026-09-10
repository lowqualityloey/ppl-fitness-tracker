export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface RateLimitEntry {
  requests: number[];
}

/**
 * Process-local sliding-window limiter for public sign-in initiation.
 *
 * This deliberately hides storage behind one module so a shared atomic store
 * can replace it before the application runs on multiple instances. Do not
 * treat process memory as a horizontally-scaled production control.
 */
export class AuthRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly maxRequests = 5,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  check(ip: string): RateLimitResult {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const previous = this.entries.get(ip)?.requests ?? [];
    const requests = previous.filter((timestamp) => timestamp > cutoff);

    if (requests.length >= this.maxRequests) {
      this.entries.set(ip, { requests });
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((requests[0]! + this.windowMs - now) / 1000)),
      };
    }

    requests.push(now);
    this.entries.set(ip, { requests });
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export const signInRateLimiter = new AuthRateLimiter();

/**
 * M2-05: five legacy imports per user per hour.
 *
 * Same sliding window as sign-in, but keyed by verified user id, because the
 * documented budget is per user and the request is authenticated before it is
 * counted. An IP key here would let one NAT'd household spend everyone else's
 * allowance; `clientIp` exists only because sign-in can be attempted before an
 * identity exists. The process-local caveat above applies identically: this is a
 * single-instance courtesy limit, not a distributed control.
 */
export const legacyImportRateLimiter = new AuthRateLimiter(5, 60 * 60 * 1000);

/**
 * The sync budget the client is documented to: 120 requests per minute per user.
 *
 * Until #42 this number existed only in prose and in a skipped test, which is the
 * same as not existing — the route would accept any volume a caller sent. It is
 * deliberately far looser than the import limiter: sync is the app's ordinary
 * write path and fires on every reconnect, so its limit is a backstop against a
 * hot loop, not an anti-abuse throttle. Same process-local caveat as every other
 * limiter in this file.
 */
export const syncRateLimiter = new AuthRateLimiter(120, 60 * 1000);

/**
 * Only accept ingress-provided metadata. Never use X-Forwarded-For directly:
 * a caller can choose it and evade throttling. Vercel strips/spoofs neither
 * this platform-specific header. Non-Vercel/local requests share `unknown`.
 */
export function clientIp(platformForwardedFor: string | null): string {
  return platformForwardedFor?.trim() || 'unknown';
}
