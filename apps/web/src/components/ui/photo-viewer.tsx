'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Avatar } from './avatar';

/**
 * A player's avatar that opens full-size when tapped, with an ✕ to close.
 *
 * Portalled to <body>: every caller renders this inside a `.glass` panel, and
 * `backdrop-filter` makes an element the containing block for fixed-position
 * descendants — in place, the overlay would cover only the card.
 *
 * Centred with flex rather than `top-1/2 -translate-y-1/2`, because Framer
 * Motion writes `transform` inline to animate scale and would overwrite the
 * translate, dropping the image half a screen down.
 */
export function ExpandablePhoto({
  src,
  name,
  size = 'lg',
}: {
  src?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Without a photo the avatar is just initials, which nothing is gained by
  // enlarging — so it stays a plain, non-interactive avatar.
  if (!src) return <Avatar src={src} name={name ?? undefined} size={size} />;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={name ? `View ${name}'s photo` : 'View photo'}
        className="ease-spring rounded-full transition-transform active:scale-95"
      >
        <Avatar src={src} name={name ?? undefined} size={size} />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setOpen(false)}
                />

                <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6">
                  <motion.img
                    src={src}
                    alt={name ?? 'Player photo'}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    className="pointer-events-auto max-h-[82dvh] max-w-full rounded-3xl object-contain"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close photo"
                  className="glass-strong rim text-ink-1 fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-50 flex h-11 w-11 items-center justify-center rounded-full"
                >
                  <X className="h-5 w-5" />
                </button>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
