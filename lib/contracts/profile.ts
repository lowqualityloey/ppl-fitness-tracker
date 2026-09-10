import { z } from 'zod';
import { createAppEnvelopeSchema } from './envelope';
import { UuidSchema } from './common';

/**
 * M3-00 (#57): `GET`/`PATCH /api/profile`.
 *
 * The server default is **kg** (`profiles.preferred_unit`, `db/schema/index.ts:67`)
 * and ADR-0005 keeps storage canonical: this value changes what the user *sees*,
 * never what is stored or sent on the wire. Conversion belongs to the client's
 * `UnitDisplay` module, not to these endpoints — a server that converted would
 * make the outbox's stored kg depend on a preference that can change while a
 * mutation is queued.
 *
 * `email` is deliberately absent from the patch shape. Identity is owned by
 * Supabase Auth; the app has no verification flow, so an editable email field
 * would be a claim the system cannot honour.
 */

/** Mirrors the `public.weight_unit` enum created by migration `0001`. */
export const PreferredUnitSchema = z.enum(['kg', 'lb']);
export type PreferredUnit = z.infer<typeof PreferredUnitSchema>;

export const ProfileDataSchema = z.object({
  userId: UuidSchema,
  email: z.string().min(3).max(320),
  displayName: z.string().max(80).nullable(),
  preferredUnit: PreferredUnitSchema,
}).strict();

export type ProfileData = z.infer<typeof ProfileDataSchema>;

/**
 * Strict by intent: an unknown key is a **400**, not a silently ignored field.
 * A client that believes it changed the user's email must be told otherwise on
 * the same request that made it believe it.
 */
export const ProfilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    preferredUnit: PreferredUnitSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one of: displayName, preferredUnit.',
  });

export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export const ProfileResponseSchema = createAppEnvelopeSchema(ProfileDataSchema);
export const ProfilePatchResponseSchema = ProfileResponseSchema;

export const profileDataSchema = ProfileDataSchema;
export const profilePatchSchema = ProfilePatchSchema;
export const profileResponseSchema = ProfileResponseSchema;
