/**
 * Shared error envelope. M1-12 introduced the authenticated-session case;
 * M1-13 adds only the public-auth boundary errors it needs. M1-15 owns the
 * wider canonical contract and must extend this type rather than replace it.
 */
export type AppErrorCode = 'UNAUTHENTICATED' | 'VALIDATION_ERROR' | 'RATE_LIMITED';

export interface AppError {
  code: AppErrorCode;
  message: string;
  status: number;
}

export type AppEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

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

export function validationError(message = 'Invalid request.'): AppError {
  return { code: 'VALIDATION_ERROR', message, status: 400 };
}

export function rateLimitedError(message = 'Too many sign-in attempts.'): AppError {
  return { code: 'RATE_LIMITED', message, status: 429 };
}
