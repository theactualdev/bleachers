'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportCroppedImage } from '@/lib/image';
import { useUploadImage } from '@/lib/hooks';
import { Avatar } from './avatar';
import { Button } from './button';

/** Loads an object URL into an `<img>` so it can be handed to canvas `drawImage`. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = src;
  });
}

/**
 * Photo picker: tap the avatar to choose a file, crop it square in a glass
 * dialog, then upload the exported WebP and hand the resulting URL back via
 * `onChange`. Follows the glass-sheet pattern from `scoring/event-picker.tsx`.
 */
export function ImagePicker({
  value,
  onChange,
  label,
  shape = 'circle',
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  shape?: 'circle' | 'square';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadImage();
  const [mounted, setMounted] = useState(false);

  // The dialog is portalled to <body>, which needs a DOM — so only after mount.
  useEffect(() => setMounted(true), []);

  const open = objectUrl !== null;

  const closeModal = useCallback(() => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [objectUrl]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setObjectUrl(URL.createObjectURL(file));
  };

  const handleUse = async () => {
    if (!objectUrl || !croppedAreaPixels) return;
    setError(null);
    try {
      const image = await loadImage(objectUrl);
      const blob = await exportCroppedImage(image, croppedAreaPixels);
      const { url } = await upload.mutateAsync(blob);
      onChange(url);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — try again');
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {label && <p className="text-eyebrow text-ink-3">{label}</p>}

      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="ease-spring block transition-transform active:scale-95"
          aria-label={value ? 'Change photo' : 'Add photo'}
        >
          {value ? (
            <Avatar src={value} size="lg" shape={shape} />
          ) : (
            <div
              className={cn(
                'glass border-hairline text-ink-3 flex h-20 w-20 items-center justify-center border border-dashed',
                shape === 'circle' ? 'rounded-full' : 'rounded-md',
              )}
            >
              <Camera className="h-6 w-6" />
            </div>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="bg-negative shadow-button absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full text-white"
            aria-label="Remove photo"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {/*
        Portalled to <body> on purpose. Every caller renders this inside a
        `.glass` panel, and `backdrop-filter` makes an element the containing
        block for fixed-position descendants — so in place, `fixed inset-0`
        covered only the card, `top-1/2` centred on the card, and the dialog
        got clipped at the card's edge with its buttons out of reach.
      */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={upload.isPending ? undefined : closeModal}
                />
                <motion.div
                  // Capped and scrollable so the cropper, zoom and buttons stay
                  // within the viewport on short screens.
                  className="glass-strong rim fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[92dvh] max-w-sm -translate-y-1/2 flex-col overflow-y-auto rounded-3xl p-5"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Crop photo"
                >
                  <p className="text-eyebrow text-ink-3 mb-3">Crop photo</p>

                  <div className="bg-canvas relative h-[min(50dvh,18rem)] w-full shrink-0 overflow-hidden rounded-xl">
                    {objectUrl && (
                      <Cropper
                        image={objectUrl}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape={shape === 'circle' ? 'round' : 'rect'}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                      />
                    )}
                  </div>

                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="accent-brand mt-4 w-full shrink-0"
                    aria-label="Zoom"
                  />

                  {error && <p className="text-negative mt-3 text-sm">{error}</p>}

                  <div className="mt-4 flex shrink-0 justify-end gap-2">
                    <Button
                      type="button"
                      variant="glass"
                      onClick={closeModal}
                      disabled={upload.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleUse()}
                      disabled={upload.isPending || !croppedAreaPixels}
                    >
                      {upload.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                        </>
                      ) : (
                        'Use photo'
                      )}
                    </Button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
