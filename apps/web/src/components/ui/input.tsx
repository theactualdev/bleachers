import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'glass text-ink-1 placeholder:text-ink-3 focus-visible:ring-brand focus-visible:ring-offset-canvas flex h-11 w-full rounded-md px-4 text-[15px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-ink-2 text-sm font-medium leading-none', className)}
      {...props}
    />
  );
}
