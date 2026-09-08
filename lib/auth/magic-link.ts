export {
  SignInRequestSchema,
  AuthConfirmQuerySchema,
  SignoutRequestSchema,
  signInRequestSchema,
  confirmQuerySchema,
  signoutRequestSchema,
} from '../contracts/auth';

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
