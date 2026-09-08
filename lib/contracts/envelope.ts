/**
 * M1-12 (pre-M1-15): minimal AppError shape.
 *
 * Spec §4.3 defines the response envelope as
 * `{ ok: true, data: T } | { ok: false, error: AppError }`, but the full
 * AppError contract belongs to M1-15 (issue #17), which hasn't landed
 * yet. requireUser() (lib/auth/require-user.ts) needs *some* typed error
 * to throw for its 401 case now, so this file defines the minimal shape
 * that satisfies the envelope's `error: AppError` slot without inventing
 * anything M1-15 would have to walk back.
 *
 * M1-15 owns this file going forward — it should extend `AppError` and
 * the `code` union as needed for every other route's error cases, not
 * create a second, competing error type.
 */

/** Status codes actually thrown by application code so far. Extend in M1-15. */
export type AppErrorCode = 'UNAUTHENTICATED';

export interface AppError {
  code: AppErrorCode;
  message: string;
  /** HTTP status a route handler should respond with for this error. */
  status: number;
}

export class AppErrorException extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(appError.message);
    this.name = 'AppErrorException';
    this.appError = appError;
  }
}

export function unauthenticatedError(message = 'No authenticated session.'): AppError {
  return { code: 'UNAUTHENTICATED', message, status: 401 };
}
