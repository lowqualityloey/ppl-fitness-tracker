const DEFAULT_REDIRECT_PATH = '/';
const ALLOWED_PATHS = new Set([DEFAULT_REDIRECT_PATH]);
const INTERNAL_ORIGIN = 'https://ppl-fitness-tracker.invalid';

/** Returns the only current safe in-app destination for auth callbacks. */
export function safeRedirectPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//')) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const parsed = new URL(rawNext, INTERNAL_ORIGIN);
    if (parsed.origin !== INTERNAL_ORIGIN || !ALLOWED_PATHS.has(parsed.pathname)) {
      return DEFAULT_REDIRECT_PATH;
    }

    // Do not reflect caller-controlled query strings or fragments into Location.
    return parsed.pathname;
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
}

export { DEFAULT_REDIRECT_PATH };
