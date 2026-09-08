import { z } from 'zod';

/** Canonical error codes shared by every route handler. */
export const APP_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const AppErrorCodeSchema = z.enum(APP_ERROR_CODES);
export type AppErrorCode = z.infer<typeof AppErrorCodeSchema>;

export interface AppError {
  code: AppErrorCode;
  message: string;
  status: number;
}

export const AppErrorSchema = z.object({
  code: AppErrorCodeSchema,
  message: z.string().min(1),
  status: z.number().int().min(400).max(599),
}).strict();

export type AppEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

/** Runtime schema for the common no-data envelope used by error responses. */
export const AppEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }).strict(),
  z.object({ ok: z.literal(false), error: AppErrorSchema }).strict(),
]);

/** Build a response schema that keeps the data payload strongly typed. */
export function createAppEnvelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema }).strict(),
    z.object({ ok: z.literal(false), error: AppErrorSchema }).strict(),
  ]);
}

export function appSuccess<T>(data: T): AppEnvelope<T> {
  return { ok: true, data };
}

export function appErrorEnvelope(error: AppError): AppEnvelope<never> {
  return { ok: false, error };
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

export function forbiddenError(message = 'You are not allowed to perform this action.'): AppError {
  return { code: 'FORBIDDEN', message, status: 403 };
}

export function validationError(message = 'Invalid request.'): AppError {
  return { code: 'VALIDATION_ERROR', message, status: 400 };
}

export function notFoundError(message = 'Resource not found.'): AppError {
  return { code: 'NOT_FOUND', message, status: 404 };
}

export function conflictError(message = 'The request conflicts with current state.'): AppError {
  return { code: 'CONFLICT', message, status: 409 };
}

export function rateLimitedError(message = 'Too many sign-in attempts.'): AppError {
  return { code: 'RATE_LIMITED', message, status: 429 };
}

export function internalError(message = 'Internal server error.'): AppError {
  return { code: 'INTERNAL_ERROR', message, status: 500 };
}
