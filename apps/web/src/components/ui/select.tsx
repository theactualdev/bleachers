'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  /** Optional second line rendered under the label (e.g. current teams). */
  sublabel?: string;
}

/**
 * A glass, theme-aware dropdown that replaces the native <select> so options can
 * carry subtext and match the design system. Closes on outside-click and Escape.
 * Pass `value=""` to use it as an action menu (the trigger keeps the placeholder).
 */
export function Select({
  value,
  options,
  placeholder = 'Select…',
  emptyLabel = 'Nothing to add',
  disabled,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="glass ease-spring focus-visible:ring-brand focus-visible:ring-offset-canvas flex h-11 w-full items-center justify-between gap-2 rounded-md px-4 text-left text-[15px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.99]"
      >
        <span className={cn('truncate', selected ? 'text-ink-1' : 'text-ink-3')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn('text-ink-3 h-4 w-4 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            className="glass-strong rim absolute z-50 mt-2 max-h-64 w-full origin-top overflow-auto rounded-md p-1.5"
          >
            {options.length === 0 ? (
              <li className="text-ink-3 px-3 py-2.5 text-sm">{emptyLabel}</li>
            ) : (
              options.map((o) => (
                <li key={o.value} role="option" aria-selected={value === o.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className="hover:bg-glass flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="text-ink-1 block truncate text-sm font-medium">{o.label}</span>
                      {o.sublabel && (
                        <span className="text-ink-3 block truncate text-xs">{o.sublabel}</span>
                      )}
                    </span>
                    {value === o.value && <Check className="text-brand h-4 w-4 shrink-0" />}
                  </button>
                </li>
              ))
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
