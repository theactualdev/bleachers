import { describe, it, expect, vi } from 'vitest';
import { AVATAR_SIZE, exportCroppedImage, type CropPixels } from './image';

const crop: CropPixels = { x: 10, y: 20, width: 300, height: 300 };
const image = {} as CanvasImageSource;

/**
 * A fake canvas that records `drawImage` calls and lets the test script the
 * sequence of blobs `toBlob` resolves with (simulating encoder support).
 */
function makeFakeCanvas(blobSequence: Array<Blob | null>) {
  const drawImageCalls: unknown[][] = [];
  let call = 0;
  const ctx = {
    drawImage: (...args: unknown[]) => {
      drawImageCalls.push(args);
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (blob: Blob | null) => void) => {
      const blob = blobSequence[call] ?? null;
      call += 1;
      cb(blob);
    }),
  };
  const createCanvas = vi.fn((w: number, h: number) => {
    canvas.width = w;
    canvas.height = h;
    return canvas as unknown as HTMLCanvasElement;
  });
  return { createCanvas, canvas, drawImageCalls };
}

describe('exportCroppedImage', () => {
  it('creates a 512x512 canvas', async () => {
    const webp = new Blob(['x'], { type: 'image/webp' });
    const { createCanvas } = makeFakeCanvas([webp]);

    await exportCroppedImage(image, crop, createCanvas);

    expect(createCanvas).toHaveBeenCalledWith(AVATAR_SIZE, AVATAR_SIZE);
  });

  it('draws the crop rect into the full destination canvas', async () => {
    const webp = new Blob(['x'], { type: 'image/webp' });
    const { createCanvas, drawImageCalls } = makeFakeCanvas([webp]);

    await exportCroppedImage(image, crop, createCanvas);

    expect(drawImageCalls[0]).toEqual([
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    ]);
  });

  it('returns the WebP blob when the encoder supports it', async () => {
    const webp = new Blob(['x'], { type: 'image/webp' });
    const { createCanvas } = makeFakeCanvas([webp]);

    const result = await exportCroppedImage(image, crop, createCanvas);

    expect(result.type).toBe('image/webp');
  });

  it('falls back to JPEG when the browser silently re-encodes WebP as PNG', async () => {
    const png = new Blob(['x'], { type: 'image/png' });
    const jpeg = new Blob(['x'], { type: 'image/jpeg' });
    const { createCanvas } = makeFakeCanvas([png, jpeg]);

    const result = await exportCroppedImage(image, crop, createCanvas);

    expect(result.type).toBe('image/jpeg');
  });

  it('throws if the canvas cannot provide a 2D context', async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
      toBlob: vi.fn(),
    };
    const createCanvas = vi.fn(() => canvas as unknown as HTMLCanvasElement);

    await expect(exportCroppedImage(image, crop, createCanvas)).rejects.toThrow(
      'Canvas 2D unavailable',
    );
  });

  it('throws if neither WebP nor JPEG encoding succeeds', async () => {
    const { createCanvas } = makeFakeCanvas([null, null]);

    await expect(exportCroppedImage(image, crop, createCanvas)).rejects.toThrow(
      'Image export failed',
    );
  });
});
