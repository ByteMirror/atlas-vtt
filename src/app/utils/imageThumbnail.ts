const THUMBNAIL_QUALITY = 0.8;

/**
 * Decodes `source` scaled so that its longer side is `size` pixels. The decode
 * and the scaling run off the main thread; only the tiny result is transferred.
 */
async function decodeScaled(source: Blob, size: number): Promise<ImageBitmap> {
  const byWidth = await createImageBitmap(source, { resizeWidth: size, resizeQuality: 'high' });
  if (byWidth.height <= size) return byWidth;
  byWidth.close();
  return createImageBitmap(source, { resizeHeight: size, resizeQuality: 'high' });
}

function encodeWebp(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = createEl('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to get canvas context');
  context.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode thumbnail'))),
      'image/webp',
      THUMBNAIL_QUALITY,
    );
  });
}

/** Renders `source` as WebP bytes whose longer side is at most `size` pixels. */
export async function renderThumbnail(source: Blob, size: number): Promise<ArrayBuffer> {
  const bitmap = await decodeScaled(source, size);
  try {
    return await (await encodeWebp(bitmap)).arrayBuffer();
  } finally {
    bitmap.close();
  }
}
