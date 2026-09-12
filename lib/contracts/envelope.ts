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

/**
 * Something the server was about to send does not match the contract that describes it.
 *
 * This is never the client's fault, so it is deliberately **not** a `ZodError`:
 * `routeErrorResponse` maps a `ZodError` to 400 `VALIDATION_ERROR`, which would blame the
 * caller for a producer-side defect. On its own type it falls through to the canonical
 * redacted 500, and the detail stays on the thrown error — visible in the test failure
 * that caught it, exactly as for every other unexpected internal error.
 */
export class ContractViolationError extends Error {
  override readonly name: string = 'ContractViolationError';

  readonly issues: readonly string[];

  constructor(subject: string, issues: readonly string[]) {
    super(`${subject} does not match the contract: ${issues.join('; ') || '(no issues reported)'}`);
    this.issues = issues;
  }
}

/**
 * Parse a payload the server is about to **send** through the contract describing it.
 *
 * Why this exists: #73 found `SessionStateSchema` still a `z.object({}).passthrough()`, so
 * the session routes could only ever have *claimed* to validate their own output.
 * Tightening a contract is worthless unless its producer is held to it — a mapper that
 * drifts has to fail at the boundary rather than ship a body the client then rejects, and
 * a client that rejects one shows an error page in the middle of someone's set.
 *
 * Parsing normalizes too: the `Date` values the repository produced leave as ISO strings,
 * so what gets validated and what gets sent are the same bytes.
 *
 * It lives in the contract layer rather than in a route because `contract-graph.test.ts`
 * forbids routes from owning schema logic; a route that calls this is still a thin adapter.
 */
export function validateOutgoing<S extends z.ZodTypeAny>(
  schema: S,
  payload: unknown,
  subject = 'outgoing response',
): z.infer<S> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ContractViolationError(
      subject,
      parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    );
  }
  return parsed.data;
}
