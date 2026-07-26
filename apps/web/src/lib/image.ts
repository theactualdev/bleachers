export interface CropPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AVATAR_SIZE = 512;

/** Draw the cropped region to a 512² canvas; WebP 0.85 with JPEG fallback. */
export async function exportCroppedImage(
  image: CanvasImageSource,
  crop: CropPixels,
  createCanvas: (w: number, h: number) => HTMLCanvasElement = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  },
): Promise<Blob> {
  const canvas = createCanvas(AVATAR_SIZE, AVATAR_SIZE);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  const toBlob = (type: string, quality?: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp', 0.85);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob('image/jpeg', 0.85);
  if (!jpeg) throw new Error('Image export failed');
  return jpeg;
}
