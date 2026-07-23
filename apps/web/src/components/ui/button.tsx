import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tactile buttons. Springy press (active:scale) + token-driven surfaces.
 * `brand` is the primary CTA: a vibrant gradient with a soft glow, not a flat fill.
 */
const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-all duration-200 ease-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40 active:scale-[0.96]',
  {
    variants: {
      variant: {
        brand: 'bg-brand text-brand-ink shadow-button hover:brightness-[1.06] active:brightness-95',
        glass: 'glass text-ink-1 hover:bg-glass-strong',
        ghost: 'text-ink-2 hover:bg-glass hover:text-ink-1',
        live: 'bg-live text-brand-ink shadow-button hover:brightness-[1.06] active:brightness-95',
        danger: 'bg-negative text-white shadow-button hover:brightness-[1.06] active:brightness-95',
        // Legacy names mapped onto the new system so un-rebuilt screens keep working.
        default: 'bg-brand text-brand-ink shadow-button hover:brightness-[1.06] active:brightness-95',
        secondary: 'glass text-ink-1 hover:bg-glass-strong',
        outline: 'glass text-ink-1 hover:bg-glass-strong',
        destructive: 'bg-negative text-white shadow-button hover:brightness-[1.06] active:brightness-95',
        success: 'bg-live text-brand-ink shadow-button hover:brightness-[1.06] active:brightness-95',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 rounded-sm px-3.5 text-xs',
        lg: 'h-14 rounded-lg px-7 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'brand', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
Button.displayName = 'Button';

export { buttonVariants };
