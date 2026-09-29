/**
 * Decodes `blob` with an `<img>` and hands the loaded image to `use`. This is
 * the main-thread fallback for formats `createImageBitmap` cannot read from a
 * Blob, notably SVG in Chromium.
 */
export async function withDecodedImage<T>(blob: Blob, use: (image: HTMLImageElement) => T | Promise<T>): Promise<T> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await use(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}
