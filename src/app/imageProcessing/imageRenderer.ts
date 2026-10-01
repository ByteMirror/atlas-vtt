import type { ImageJob, ImageJobResult, ImageLayout, ThumbnailSpec } from './imageJob';
import { fitWithin, frameImageRect, frameSize, scaleDown, type Size } from './imageLayout';

/**
 * Runs inside an image worker: one decode per job, scaling on a 2D canvas,
 * WebP encoding on the worker's thread (browsers encode on the CPU only).
 * Nothing here may touch the DOM or Obsidian.
 */

const WEBP = 'image/webp';

/** Raised when the worker cannot read the source format, so the main thread can decode it instead. */
export class SourceDecodeError extends Error {}

type Drawable = ImageBitmap | OffscreenCanvas;

async function decode(source: Blob | ImageBitmap): Promise<ImageBitmap> {
  if (source instanceof ImageBitmap) return source;
  try {
    return await createImageBitmap(source);
  } catch (error) {
    throw new SourceDecodeError(error instanceof Error ? error.message : 'Could not decode the image.');
  }
}

/** WebP files start with `RIFF`, a four-byte length and `WEBP`. */
async function isWebp(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const text = String.fromCharCode(...header);
  return text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP';
}

/**
 * The browser picks the backing: with GPU raster the scaling runs on the GPU
 * and only the small result is read back for encoding, which measured faster
 * than a software canvas. `high` is Chromium's best downscaling filter; the
 * canvas default, `low`, aliases.
 */
function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface for the image.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

async function encode(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type: WEBP, quality });
  if (blob.type !== WEBP) throw new Error('This system cannot encode WebP images.');
  return blob;
}

/**
 * `source` halved until it is less than four times `size`, so the final draw
 * reduces it at most fourfold. A single draw over a larger reduction samples
 * too few source pixels and aliases.
 */
function reduced(source: Drawable, size: Size): Drawable {
  let current = source;
  while (Math.min(current.width / size.width, current.height / size.height) >= 4) {
    const half = new OffscreenCanvas(Math.round(current.width / 2), Math.round(current.height / 2));
    context(half).drawImage(current, 0, 0, half.width, half.height);
    freeIntermediate(current, source);
    current = half;
  }
  return current;
}

/** Releases a halving step's pixels now instead of at garbage collection; for maps they are tens of megabytes. */
function freeIntermediate(drawable: Drawable, source: Drawable): void {
  if (drawable !== source && drawable instanceof OffscreenCanvas) {
    drawable.width = 0;
    drawable.height = 0;
  }
}

function renderFit(source: Drawable, size: Size): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const scaled = reduced(source, size);
  context(canvas).drawImage(scaled, 0, 0, size.width, size.height);
  freeIntermediate(scaled, source);
  return canvas;
}

function renderFrame(bitmap: ImageBitmap, layout: Extract<ImageLayout, { kind: 'frame' }>): OffscreenCanvas {
  const frame = frameSize(bitmap, layout.placement, layout.minSize, layout.maxSize);
  const rect = frameImageRect(bitmap, layout.placement, frame);
  const canvas = new OffscreenCanvas(frame, frame);
  const scaled = reduced(bitmap, rect);
  context(canvas).drawImage(scaled, rect.left, rect.top, rect.width, rect.height);
  freeIntermediate(scaled, bitmap);
  return canvas;
}

function scaledCopy(source: Drawable, spec: ThumbnailSpec): OffscreenCanvas {
  return renderFit(source, fitWithin(source, spec.size, spec.size));
}

async function renderCopy(source: Drawable, spec: ThumbnailSpec | undefined): Promise<Blob | null> {
  return spec ? encode(scaledCopy(source, spec), spec.quality) : null;
}

/**
 * The thumbnail and preview of `output`. A preview at least as large as the
 * thumbnail is its source, so a large map is reduced once rather than twice.
 */
async function renderCopies(output: Drawable, job: ImageJob): Promise<Pick<ImageJobResult, 'thumbnail' | 'preview'>> {
  const previewCanvas = job.preview ? scaledCopy(output, job.preview) : null;
  const preview = previewCanvas && job.preview ? await encode(previewCanvas, job.preview.quality) : null;
  const thumbnailSource = previewCanvas && job.thumbnail && Math.max(previewCanvas.width, previewCanvas.height) >= job.thumbnail.size
    ? previewCanvas : output;
  const thumbnail = job.thumbnail ? await encode(scaledCopy(thumbnailSource, job.thumbnail), job.thumbnail.quality) : null;
  return { thumbnail, preview };
}

/** A WebP source that needs no scaling is kept as it is: re-encoding would only lose quality. */
async function keepsSource(layout: ImageLayout, source: Blob, bitmap: ImageBitmap): Promise<boolean> {
  return layout.kind === 'fit' && bitmap.width <= layout.maxWidth && bitmap.height <= layout.maxHeight && isWebp(source);
}

function render(bitmap: ImageBitmap, layout: ImageLayout): OffscreenCanvas {
  return layout.kind === 'fit'
    ? renderFit(bitmap, fitWithin(bitmap, layout.maxWidth, layout.maxHeight))
    : renderFrame(bitmap, layout);
}

export async function renderImageJob(job: ImageJob): Promise<ImageJobResult> {
  const bitmap = await decode(job.source);
  try {
    const sourcePreview = await renderCopy(bitmap, job.sourcePreview);
    if (job.source instanceof Blob && await keepsSource(job.layout, job.source, bitmap)) {
      return { image: job.source, sourcePreview, ...await renderCopies(bitmap, job) };
    }
    const canvas = render(bitmap, job.layout);
    const scaledDown = scaleDown(job.layout, bitmap, canvas);
    // The output no longer needs the decoded source; free it before the slow encode.
    bitmap.close();
    return { image: await encode(canvas, job.quality), sourcePreview, ...await renderCopies(canvas, job), scaledDown };
  } finally {
    bitmap.close();
  }
}
