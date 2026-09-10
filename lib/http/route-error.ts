import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
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

export function appErrorResponse(error: AppError): NextResponse<AppEnvelope<never>> {
  return NextResponse.json<AppEnvelope<never>>(appErrorEnvelope(error), { status: error.status });
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

  return appErrorResponse(internalError());
}
