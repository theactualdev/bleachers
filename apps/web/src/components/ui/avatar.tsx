import * as React from 'react';
import type { TeamColors } from '@bleachers/types';
import { cn } from '@/lib/utils';

const sizeClass: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-20 w-20 text-lg',
};

/** "Jo Bloggs" → "JB"; single-word names fall back to their first letter. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Photo/logo avatar. Falls back to initials-on-glass for players, or a
 * two-tone color bar (from team `colors`) when no photo is set for teams.
 */
export function Avatar({
  src,
  name,
  color,
  size = 'md',
  shape = 'circle',
  className,
}: {
  src?: string | null;
  name?: string;
  color?: TeamColors;
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'square';
  className?: string;
}) {
  const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-md';

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        className={cn('object-cover', shapeClass, sizeClass[size], className)}
      />
    );
  }

  if (color) {
    return (
      <div
        className={cn(
          'border-hairline shrink-0 overflow-hidden border',
          shapeClass,
          sizeClass[size],
          className,
        )}
        style={{
          background: color.secondary
            ? `linear-gradient(135deg, ${color.primary} 50%, ${color.secondary} 50%)`
            : color.primary,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={cn(
        'glass text-ink-1 border-hairline flex shrink-0 items-center justify-center border font-semibold',
        shapeClass,
        sizeClass[size],
        className,
      )}
      aria-hidden="true"
    >
      {initials(name ?? '')}
    </div>
  );
}
