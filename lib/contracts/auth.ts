import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope.js';

/** Public email-only sign-in request. */
export const SignInRequestSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

/**
 * Magic-link callback query. `next` is only an input value; redirect handling
 * must still go through safeRedirectPath() and must never use it directly.
 */
export const AuthConfirmQuerySchema = z.object({
  token_hash: z.string().min(1).max(2048),
  type: z.literal('email'),
  next: z.string().max(2048).optional(),
}).strict();

export const SignInDataSchema = z.object({ message: z.string().min(1) }).strict();
export const SignInResponseSchema = createAppEnvelopeSchema(SignInDataSchema);
export const SignoutRequestSchema = z.object({}).strict();
export const SignoutDataSchema = z.object({ signedOut: z.literal(true) }).strict();
export const SignoutResponseSchema = createAppEnvelopeSchema(SignoutDataSchema);

export type SignInRequest = z.infer<typeof SignInRequestSchema>;
export type SignInData = z.infer<typeof SignInDataSchema>;
export type AuthConfirmQuery = z.infer<typeof AuthConfirmQuerySchema>;
export type SignoutRequest = z.infer<typeof SignoutRequestSchema>;
export type SignoutData = z.infer<typeof SignoutDataSchema>;

// Lower-camel aliases preserve the M1-13 route/test API while the contract
// layer exposes the canonical PascalCase names used by the M1 RFC.
export const signInRequestSchema = SignInRequestSchema;
export const signInResponseSchema = SignInResponseSchema;
export const confirmQuerySchema = AuthConfirmQuerySchema;
export const signoutRequestSchema = SignoutRequestSchema;
