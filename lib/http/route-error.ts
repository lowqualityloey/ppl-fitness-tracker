import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { reportServerError } from '../errors/server-report';
import { currentCorrelation, log } from '../logger';
import {
  AppErrorException,
  appErrorEnvelope,
  conflictError,
  internalError,
  notFoundError,
  validationError,
  type AppError,
  type AppEnvelope,
} from '../contracts/envelope';
import {
  InvalidSessionCursorError,
  SessionConflictError,
  SessionNotFoundError,
  SessionStartConflictError,
  SessionValidationError,
} from '../domain/sessions/types';
import {
  SyncConflictError,
  SyncValidationError,
} from '../domain/sync/types';
import { LegacyImportValidationError } from '../domain/import/types';

/**
 * Optional `headers` exists for the per-user 404s (M3-00): a "not found" on an
 * authenticated, user-scoped resource is still a per-user answer, and the
 * `no-store` discipline that covers the 200 covers it too. Callers that never
 * pass headers behave exactly as before.
 */
export function appErrorResponse(
  error: AppError,
  headers?: HeadersInit,
): NextResponse<AppEnvelope<never>> {
  // M4-05 (#94): the opaque request id is stamped here — the one choke point
  // every error response passes through — rather than at the eleven call sites
  // that build these envelopes. Outside a request scope (unit tests, scripts)
  // `currentCorrelation()` is empty and the payload is byte-for-byte what it
  // was before the seam; inside one, the id a user can quote to support is
  // the same id the completion line carries. A caller that set `requestId`
  // explicitly keeps its value.
  const requestId = error.requestId ?? currentCorrelation().requestId;
  const payload: AppError = requestId ? { ...error, requestId } : error;
  const merged: HeadersInit = payload.retryAfter != null
    ? { ...(headers ?? {}), 'Retry-After': String(payload.retryAfter) }
    : (headers ?? {});
  return NextResponse.json<AppEnvelope<never>>(appErrorEnvelope(payload), { status: payload.status, headers: merged });
}

export function routeErrorResponse(error: unknown): NextResponse<AppEnvelope<never>> {
  if (error instanceof AppErrorException) {
    return appErrorResponse(error.appError);
  }

  if (
    error instanceof ZodError ||
    error instanceof InvalidSessionCursorError ||
    error instanceof SessionValidationError ||
    error instanceof SyncValidationError ||
    error instanceof LegacyImportValidationError
  ) {
    return appErrorResponse(validationError());
  }

  if (
    error instanceof SessionStartConflictError ||
    error instanceof SessionConflictError ||
    error instanceof SyncConflictError
  ) {
    return appErrorResponse(conflictError());
  }

  if (error instanceof SessionNotFoundError || (error instanceof Error && error.name === 'SessionNotFoundError')) {
    return appErrorResponse(notFoundError());
  }

  // #125's complaint in one line: this branch used to discard the cause
  // entirely. The client still gets the canonical redacted 500 — nothing
  // internal crosses the wire — but the server now keeps the cause on the
  // request's own id, so "it 500'd" is answerable without reproduction.
  //
  // M4-06 (#95): and the same cause is what the error channel gets. This branch is
  // the *only* producer of an unintended 500 in the app — every caller-facing
  // rejection above is typed, and `AppErrorException` is thrown only by
  // `requireUserContext` with a 401 or a 503 (#125's shed path, which is load rather
  // than a defect, and is already logged with its cause). So "reported" and "our bug"
  // are the same set here, which is exactly the distinction AC-3 asks the event to
  // keep. Reported before the response is built, because a handler that answers a
  // clean 500 is still a handler that broke.
  log.error('route error: unhandled cause', { error });
  reportServerError(error, { plane: 'server', source: 'route-error:unhandled', kind: 'producer' });
  return appErrorResponse(internalError());
}
