import type { FramePlacement, ImageJob, ImageJobResult, ThumbnailSpec } from './imageJob';
import { imageDimensions } from './imageDimensions';
import { withDecodedImage } from './imageElement';
import type { Size } from './imageLayout';
import { ImageDecodeError, ImageWorkerPool, type ImageJobOptions } from './ImageWorkerPool';
import ImageWorker from './imageWorker?worker&inline';

export type { FramePlacement, ThumbnailSpec, ImageJobResult as ProcessedImage } from './imageJob';

/**
 * Image conversion for imports: decoding, scaling and WebP encoding run in a
 * pool of workers, so Obsidian stays responsive and a batch uses several
 * cores. Browsers encode images on the CPU only; parallel workers are what
 * make a batch faster.
 */

export interface ImagePreset {
  maxWidth: number;
  maxHeight: number;
  /** WebP quality, 0–1. */
  quality: number;
}

export const IMAGE_PRESETS = {
  token: { maxWidth: 400, maxHeight: 400, quality: 0.85 },
  map: { maxWidth: 8192, maxHeight: 8192, quality: 0.8 },
} as const satisfies Record<string, ImagePreset>;

export interface ProcessOptions {
  signal?: AbortSignal | undefined;
  thumbnail?: ThumbnailSpec | undefined;
  preview?: ThumbnailSpec | undefined;
  /** Work nobody waits for yet, such as preview conversions; jobs someone waits for run first. */
  background?: boolean;
}

/** Workers beyond this add little for batches of token art and cost memory. */
const MAX_WORKERS = 6;
/**
 * Decoded pixels all running jobs may hold together. Token art runs in
 * parallel; a huge map (150 megapixels hold 1.2 GB while converting) runs alone.
 */
const MEMORY_BUDGET_BYTES = 1024 ** 3;
/** Longer side of a vector image (SVG) once rasterized; vectors have no pixels of their own. */
const VECTOR_RASTER_SIZE = 2048;
const SVG = 'image/svg+xml';

let pool: ImageWorkerPool | null = null;
/** Set on unload, so work finishing afterwards cannot start new workers for a plugin that is gone. */
let disposed = false;

function workerPool(): ImageWorkerPool {
  if (disposed) throw new Error('Image processing has stopped.');
  pool ??= new ImageWorkerPool(() => new ImageWorker({ name: 'Atlas image processing' }), {
    maxWorkers: workerCount(),
    memoryBudget: MEMORY_BUDGET_BYTES,
  });
  return pool;
}

/** One core stays free for Obsidian itself. */
function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.min(MAX_WORKERS, Math.max(1, cores - 1));
}

/** Stops the workers; called when the plugin unloads. */
export function disposeImageProcessing(): void {
  disposed = true;
  pool?.dispose();
  pool = null;
}

/** Rasterizes `blob` on the main thread for formats workers cannot decode. */
function rasterize(blob: Blob): Promise<ImageBitmap> {
  return withDecodedImage(blob, (image) => {
    const width = image.naturalWidth || VECTOR_RASTER_SIZE;
    const height = image.naturalHeight || VECTOR_RASTER_SIZE;
    const scale = blob.type === SVG ? VECTOR_RASTER_SIZE / Math.max(width, height) : 1;
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a drawing surface for the image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.transferToImageBitmap();
  });
}

/** Memory a job holds while it runs: the decoded source plus, at most as large, the output and its scaling steps. */
function jobCost(size: Size | null): number | undefined {
  return size ? size.width * size.height * 4 * 2 : undefined;
}

async function process(source: Blob, job: Omit<ImageJob, 'source'>, options: ProcessOptions): Promise<ImageJobResult> {
  const run: ImageJobOptions = { signal: options.signal, background: options.background ?? false, cost: jobCost(await imageDimensions(source)) };
  const withCopies = { ...job, thumbnail: options.thumbnail, preview: options.preview };
  // One pool for both attempts: after unload it refuses the fallback and frees its bitmap
  const workers = workerPool();
  try {
    return await workers.run({ ...withCopies, source }, run);
  } catch (error) {
    if (!(error instanceof ImageDecodeError)) throw error;
    const bitmap = await rasterize(source);
    return workers.run({ ...withCopies, source: bitmap }, { ...run, cost: jobCost(bitmap), transfer: [bitmap] });
  }
}

/** `source` scaled down to fit the preset and encoded as WebP. */
export function optimizeImage(source: Blob, preset: ImagePreset, options: ProcessOptions = {}): Promise<ImageJobResult> {
  return process(source, { layout: { kind: 'fit', maxWidth: preset.maxWidth, maxHeight: preset.maxHeight }, quality: preset.quality }, options);
}

export interface FrameOptions extends ProcessOptions {
  minSize: number;
  maxSize: number;
  quality: number;
}

/** A square WebP of `source` placed in a frame; areas it does not cover stay transparent. */
export function renderFramedImage(source: Blob, placement: FramePlacement, options: FrameOptions): Promise<ImageJobResult> {
  const { minSize, maxSize, quality } = options;
  return process(source, { layout: { kind: 'frame', placement, minSize, maxSize }, quality }, options);
}

/** WebP bytes of `source` whose longer side is at most `spec.size` pixels. */
export async function renderThumbnail(source: Blob, spec: ThumbnailSpec): Promise<ArrayBuffer> {
  const { image } = await optimizeImage(source, { maxWidth: spec.size, maxHeight: spec.size, quality: spec.quality });
  return image.arrayBuffer();
}
