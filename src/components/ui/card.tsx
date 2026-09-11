import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * M3-02 (#59): vendored shadcn/ui Card. `--radius-card` (16px) and the
 * three-level elevation stack arrive through the theme mappings
 * (`rounded-lg`, `shadow-elevation-*`), so the surface this project's
 * contrast gate measures against (`--card` = surface-bright `#ffffff`) is
 * the surface these components actually paint.
 *
 * Where a day card wears its accent, the sanctioned expression is a 2px
 * border utility (RFC §4.7) applied by the *screen* via `className`; the
 * component itself ships no accent variant, for the same reason Button does
 * not: making the wrong thing unnameable is the control.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-6 rounded-lg border border-border bg-card text-card-foreground shadow-elevation-md',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 px-6 pt-6', className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('text-sm text-muted-foreground', className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-6 pb-6', className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
