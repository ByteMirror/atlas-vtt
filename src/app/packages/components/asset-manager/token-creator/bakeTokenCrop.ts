import { renderedImageRect, TOKEN_CROP_FRACTION } from './cropMath';
import type { ImagePosition } from './types';

const MIN_OUTPUT_SIZE = 256;
const MAX_OUTPUT_SIZE = 1024;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image for cropping'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode cropped image'))), 'image/png');
  });
}

/**
 * Renders exactly what the preview shows inside the token circle: the square
 * bounding box of the crop, taken from the full-resolution upload, with any
 * area beyond the image left transparent. The token renderer masks the
 * result to a circle, so no circular alpha mask is baked in here.
 */
export async function bakeTokenCrop(file: File, scale: number, position: ImagePosition): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const aspect = { width: image.naturalWidth, height: image.naturalHeight };
    const rect = renderedImageRect(scale, position, aspect);
    const cropOrigin = (1 - TOKEN_CROP_FRACTION) / 2;

    const sourcePixels = Math.round((aspect.width * TOKEN_CROP_FRACTION) / scale);
    const outputSize = Math.min(MAX_OUTPUT_SIZE, Math.max(MIN_OUTPUT_SIZE, sourcePixels));

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const unitsToPixels = outputSize / TOKEN_CROP_FRACTION;
    ctx.scale(unitsToPixels, unitsToPixels);
    ctx.translate(-cropOrigin, -cropOrigin);
    ctx.drawImage(image, rect.left, rect.top, rect.width, rect.height);

    const blob = await canvasToBlob(canvas);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
