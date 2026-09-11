import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

/**
 * M3-02 (#59): vendored shadcn/ui Badge — and the ONLY component allowed to
 * paint a day accent, because RFC §4.7 scopes accents to "the day badge and
 * a 2px card border" and a card border is a utility, not a component. That
 * makes this file the complete audit surface for accent-as-text, which
 * scripts/check-contrast.ts measures: each `push`/`pull`/`legs` variant is
 * accent text + a 2px accent border on the card surface, and it clears the
 * badge-text bar (≥4.5:1) here or the gate is red.
 *
 * The accent never carries meaning alone: whatever screen renders a day
 * badge also renders the day NAME as its text (and an icon for the set/
 * completion states, RFC §4.7) — the badge is a label, not a swatch.
 * No `dark:` classes (ADR-0005, light-only v1).
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-badge border px-3 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border bg-card text-foreground',
        // Day accents (RFC §4.7). Text and 2px border in the accent, on the
        // card surface — the pair the contrast gate enumerates. `bg-card`
        // keeps the measured surface explicit instead of assuming inheritance.
        push: 'border-2 border-primary bg-card text-primary',
        pull: 'border-2 border-[var(--accent-pull)] bg-card text-[var(--accent-pull)]',
        legs: 'border-2 border-[var(--accent-legs)] bg-card text-[var(--accent-legs)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
