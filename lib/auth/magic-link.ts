import { z } from 'zod';

export const signInRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const confirmQuerySchema = z.object({
  token_hash: z.string().min(1).max(2048),
  type: z.literal('email'),
});

export function appUrl(): URL {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!rawUrl) {
    throw new Error('NEXT_PUBLIC_APP_URL must be configured.');
  }

  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use http or https.');
  }
  return url;
}

export function confirmUrl(): string {
  return new URL('/auth/confirm', appUrl()).toString();
}
