'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Segmented one-time-code field.
 *
 * One real input stretched invisibly over the boxes, rather than N inputs with
 * focus juggling — paste, autofill (`one-time-code`), backspace and mobile
 * keyboards all behave natively that way, and there is only ever one caret.
 */
export function CodeInput({
  value,
  onChange,
  length,
  autoFocus,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  length: number;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [focused, setFocused] = React.useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="relative" onClick={() => ref.current?.focus()} role="presentation">
      <div className="flex items-center gap-1.5">
        {Array.from({ length }, (_, i) => {
          const char = value[i];
          const isActive = focused && i === activeIndex;
          return (
            <div
              key={i}
              className={cn(
                'glass font-display tabnums text-ink-1 flex h-14 flex-1 items-center justify-center rounded-md text-2xl font-bold transition-all duration-150',
                isActive && 'ring-brand ring-offset-canvas ring-2 ring-offset-2',
                disabled && 'opacity-40',
              )}
            >
              {char ?? <span className="bg-ink-3/40 h-1 w-2.5 rounded-full" />}
            </div>
          );
        })}
      </div>

      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        disabled={disabled}
        maxLength={length}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Invisible but genuinely focusable and typeable — never `hidden`, or
        // mobile keyboards and autofill stop working.
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label="Sign-in code"
      />
    </div>
  );
}
