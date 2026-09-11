import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * M3-02 (#59): the shadcn `cn()` helper. Lives under `src/lib/` (not the root
 * `lib/`) so the `@/*` → `./src/*` alias in tsconfig resolves it — server code
 * keeps its relative imports; this is client-side component plumbing and the
 * only file that belongs to the UI's import graph.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
