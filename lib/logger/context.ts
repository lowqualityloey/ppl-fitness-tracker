/**
 * M4-05 (#94): the correlation context of the logging seam.
 *
 * Why a continuation and not an argument. The card asks for "a correlation id
 * from route handler to domain rejection", and the line that has to prove it is
 * the one this repo already had to learn from: `requireUserContext`
 * (`lib/auth/require-user.ts`) logs the shed cause that #125 was filed for, and
 * it is called three frames below a route handler with no `Request` in scope.
 * Threading an id through it would mean changing the signature of the function
 * every authenticated handler calls, which is exactly the kind of discipline
 * that decays silently. A continuation carries it instead, and the call site
 * cannot forget.
 *
 * Why a handler-top scope and not Next middleware (spec §4.3 offers both).
 * Middleware runs in its own request context — a different async execution, and
 * by default a different runtime — so anything it establishes is invisible to
 * the code beneath a route handler, which is the only place this matters. The
 * alternative that does cross the boundary is an injected internal request
 * header; it makes the id exist for static and page requests that never log,
 * and it must then be stripped from any client-visible response to keep §4.3's
 * "no client response header" promise. A handler-top scope is also what this
 * repo already trusts for exactly this problem: `withUser()`
 * (`lib/db/with-user.ts`) establishes a JWT-claims scope for everything beneath
 * it and is enforced by a lint ban rather than by convention. This is the same
 * shape, one layer up.
 *
 * Why the inbound `x-request-id` is ignored. A caller that could name our log
 * lines could stitch a false trail across two users' requests, and the audit
 * value of the id depends on it being ours. It is minted here and nowhere else.
 *
 * Why the inner record is mutable. `AsyncLocalStorage` hands a *new* store to
 * children of `run()`, so re-setting the store to attach a `userId` after the
 * auth hop would leave every scope entered earlier (the handler itself) looking
 * at the old, emptier one. One object, mutated once, is what makes "one
 * request, one id" and "the user became known mid-request" both true at the
 * same time. The record never escapes `withRequestScope`, so the mutation
 * cannot bleed between requests.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/** The correlation fields a request scope carries. camelCase here, snake_case on the wire — see `logger.ts`. */
export interface RequestCorrelation {
  requestId: string | null;
  userId: string | null;
  sessionId: string | null;
}

export interface RequestScopeInit {
  /** Test seam. Mirrors `newId` in `src/app/state/device-identity.ts:56`. */
  newRequestId?: () => string;
  /** Pins the id outright; when absent a nested scope inherits, and a top-level scope mints. */
  requestId?: string;
  userId?: string | null;
  sessionId?: string | null;
}

interface RequestScope {
  readonly fields: RequestCorrelation;
}

const storage = new AsyncLocalStorage<RequestScope>();

/** Node 24 provides this on every runtime the app targets; no `node:crypto` import needed. */
export function mintRequestId(): string {
  return globalThis.crypto.randomUUID();
}

const UNCORRELATED: RequestCorrelation = {
  requestId: null,
  userId: null,
  sessionId: null,
};

/**
 * A copy, so a caller can hold it across an await without seeing a later
 * `attachCorrelation` arrive backwards in time.
 */
export function currentCorrelation(): RequestCorrelation {
  const scope = storage.getStore();
  return scope ? { ...scope.fields } : { ...UNCORRELATED };
}

export function hasRequestScope(): boolean {
  return storage.getStore() !== undefined;
}

/**
 * Establishes a request scope for everything `run` awaits.
 *
 * The argument order is the repo's, not Node's: the action comes first and the
 * options last, mirroring `withUser(run, init)` (`lib/db/with-user.ts:34`), so
 * that the common call — a route handler that only needs an id — reads
 * `withRequestScope(() => handle(req))` instead of `withRequestScope({}, ...)`.
 * `AsyncLocalStorage.run(store, callback)` is the other way round; this wrapper
 * is deliberately not a pass-through to it.
 *
 * A top-level call mints a fresh id. A nested call inherits the outer id,
 * because AC-1 of this card is "one id, whole trail" and a handler that reaches
 * for the helper twice must not fork its own trail.
 */
export function withRequestScope<T>(run: () => T, init: RequestScopeInit = {}): T {
  const parent = storage.getStore();
  const fields: RequestCorrelation = {
    requestId:
      init.requestId ??
      parent?.fields.requestId ??
      (init.newRequestId ?? mintRequestId)(),
    userId: init.userId ?? parent?.fields.userId ?? null,
    sessionId: init.sessionId ?? parent?.fields.sessionId ?? null,
  };
  return storage.run({ fields }, run);
}

/**
 * Fills in correlation fields that become known mid-request — `userId` after
 * the auth hop, `sessionId` once a session is resolved.
 *
 * Returns whether anything actually landed. "There was a scope but this patch
 * wrote nothing" and "the field is now recorded" are different facts, and the
 * caller cannot tell them apart from a bare `true`: a line that silently keeps
 * carrying `"user_id":null` after a hop that claimed to have attached one is
 * the same class of dead end #125 recorded, where the count moved and nothing
 * explained it.
 *
 * Never throws. Unscoped logging is the normal case outside a request (scripts,
 * boot-time work, tests, and every handler commit 1 has not wrapped yet), and a
 * context helper that failed there would be a new way to lose the cause of a
 * failure instead of reporting it.
 *
 * An established field is never overwritten: the id is minted once per request,
 * and a second `userId` arriving means the scopes are wrong, not that the
 * record should move.
 */
export function attachCorrelation(
  patch: Partial<Pick<RequestCorrelation, 'requestId' | 'userId' | 'sessionId'>>,
): boolean {
  const scope = storage.getStore();
  if (!scope) return false;
  let attached = false;
  for (const [key, value] of Object.entries(patch)) {
    // A blank is not an identity. Writing `"user_id":"   "` would be worse than
    // writing nothing, because it reads like a value that was checked.
    if (typeof value !== 'string' || value.trim() === '') continue;
    const field = key as keyof RequestCorrelation;
    if (scope.fields[field] === null) {
      (scope.fields as unknown as Record<string, unknown>)[field] = value;
      attached = true;
    }
  }
  return attached;
}
