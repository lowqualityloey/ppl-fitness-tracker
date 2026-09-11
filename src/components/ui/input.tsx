import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * M3-06 (#63): vendored shadcn/ui Input, added because the runner needs editable
 * weight and reps and M3-02 vendored only Badge/Button/Card.
 *
 * Two constraints specific to this app, both of which a generic copy-paste would
 * break:
 *
 * - **Focus is NOT overridden.** ADR-0004's ring (2px `--focus-ring` + 2px offset, no
 *   glow) is applied globally, and the whole reason #59's contrast gate exists is that
 *   the previous app's users could not see focus. A shadcn paste that sets its own
 *   `focus-visible:ring-*` would silently replace a measured value with an unmeasured
 *   one. So this file has no focus classes at all.
 * - **No `dark:` classes.** Light-only v1, per ADR-0005 and the same note in Badge.
 *
 * It is `type="text"` with `inputMode="decimal"` at the call site rather than
 * `type="number"` by default: a number input's spinners and its scroll-wheel
 * increment are a way to change a working set's load by accident mid-set, and the
 * canonical-kg conversion (ADR-0005) lives in `UnitDisplay`, which needs to parse the
 * string itself.
 */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        // `rounded-md` is the token binding: globals.css maps `--radius-md` to
        // `--radius-input` (12px), the measured DESIGN.md shape for inputs. Naming the
        // utility rather than a literal radius keeps the token audit in one place.
        'flex h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2',
        'text-base text-foreground shadow-none transition-colors',
        'placeholder:text-muted-foreground',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
