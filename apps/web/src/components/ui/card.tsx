import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Frosted-glass surface. `rim` adds the bright top edge of real glass.
 * Radii use tokens (rounded-xl = 24px); nest inner elements one step down
 * (rounded-md / rounded-sm) to keep corners visually concentric.
 */
export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { strong?: boolean; rim?: boolean }
>(({ className, strong, rim = true, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative overflow-hidden rounded-xl',
      strong ? 'glass-strong' : 'glass',
      rim && 'rim',
      className,
    )}
    {...props}
  />
));
Card.displayName = 'Card';

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-ink-1 text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}
