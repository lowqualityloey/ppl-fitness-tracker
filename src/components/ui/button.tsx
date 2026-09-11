import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

/**
 * M3-02 (#59): vendored shadcn/ui Button, adapted to this design system:
 *
 * - Radius comes from `--radius-button` (16px) via the `rounded-lg` theme
 *   mapping — never a literal.
 * - No `dark:` classes: v1 is light-only by ADR-0005, and unused dark
 *   variants are exactly how palettes drift from the token file.
 * - Focus is NOT overridden. The ADR-0004 ring (2px primary + 2px offset)
 *   is declared once in `globals.css`; upstream shadcn classes that zero the
 *   outline and substitute a 3px glow were deliberately not copied, since
 *   that glow is the measured ≈1.1:1 defect ADR-0004 replaced.
 * - The CTA variant is primary blue on every page of every training day
 *   (RFC §4.7). There is no accent variant, on purpose: day accents are
 *   badge-and-border only, and an accent CTA is unnameable from here.
 */
const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-150 ease-in-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow-elevation-sm hover:bg-primary/90',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-elevation-sm hover:bg-destructive/90',
        outline: 'border-border bg-card text-foreground hover:bg-muted',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
      },
      // Sizes honor the design workflow's 44px minimum touch target — this
      // app is used one-handed in a gym, so upstream shadcn's h-9/h-8 ramp
      // was not copied down; a `sm` size that could not clear 44px is absent
      // rather than present and non-compliant.
      size: {
        default: 'h-11 px-4 py-2',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
