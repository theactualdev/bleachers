import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The Bleachers mark, replacing the placeholder "B" tile.
 *
 * The source PNG is full-bleed — the dark canvas runs to the edges — so the
 * rounded tile is CSS here rather than baked in. That keeps one asset serving
 * both this and the PWA icon, where the launcher wants square edges.
 *
 * `alt` is empty by default: every current usage sits directly above the
 * "Bleachers" wordmark, so naming the image would just make a screen reader say
 * it twice.
 */
export function Logo({
  size = 56,
  className,
  priority,
  alt = '',
}: {
  size?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
}) {
  return (
    <div
      className={cn('rim relative shrink-0 overflow-hidden rounded-2xl', className)}
      style={{ width: size, height: size }}
    >
      <Image src="/icons/icon-512.png" alt={alt} width={size} height={size} priority={priority} />
    </div>
  );
}
