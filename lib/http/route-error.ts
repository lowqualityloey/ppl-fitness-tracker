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
  SessionStartConflictError,
} from '../domain/sessions/types';

export function appErrorResponse(error: AppError): NextResponse<AppEnvelope<never>> {
  return NextResponse.json<AppEnvelope<never>>(appErrorEnvelope(error), { status: error.status });
}

export function routeErrorResponse(error: unknown): NextResponse<AppEnvelope<never>> {
  if (error instanceof AppErrorException) {
    return appErrorResponse(error.appError);
  }

  if (error instanceof ZodError || error instanceof InvalidSessionCursorError) {
    return appErrorResponse(validationError());
  }

  if (error instanceof SessionStartConflictError) {
    return appErrorResponse(conflictError());
  }

  if (error instanceof Error && error.name === 'SessionNotFoundError') {
    return appErrorResponse(notFoundError());
  }

  return appErrorResponse(internalError());
}
