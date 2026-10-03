import type { FramePlacement, ImageJob, ImageJobResult, ImageLayout, ThumbnailSpec } from './imageJob';
import { imageDimensions } from './imageDimensions';
import { withDecodedImage } from './imageElement';
import { vectorRasterSize, type Size } from './imageLayout';
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
  sourcePreview?: ThumbnailSpec | undefined;
  /** Work nobody waits for yet, such as preview conversions; jobs someone waits for run first. */
  background?: boolean;
}

/** Workers beyond this add little for batches of token art and cost memory. */
const MAX_WORKERS = 6;
/**
 * Decoded pixels all running jobs may hold together. Token art runs in
 * parallel; a huge map (150 megapixels hold 1.2 GB while converting) runs alone.
 */
export const MEMORY_BUDGET_BYTES = 1024 ** 3;
/** Side assumed for an image that reports no size of its own, such as an SVG without dimensions. */
const UNSIZED_IMAGE_SIDE = 2048;
const SVG = 'image/svg+xml';

/**
 * Main-thread rasters go one at a time, each until its worker is done: the
 * bitmap waits outside the pool's memory budget, and an SVG map's holds up to
 * 256 MB.
 */
let lastRaster: Promise<unknown> = Promise.resolve();

function afterEarlierRasters<T>(task: () => Promise<T>): Promise<T> {
  const result = lastRaster.then(task);
  lastRaster = result.catch(() => undefined);
  return result;
}

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

/**
 * Rasterizes `blob` on the main thread for formats workers cannot decode. A
 * vector image is drawn at the size `layout` asks for, so an SVG map gets a
 * map's pixels rather than a token's.
 */
function rasterize(blob: Blob, layout: ImageLayout): Promise<ImageBitmap> {
  return withDecodedImage(blob, (image) => {
    const natural = { width: image.naturalWidth || UNSIZED_IMAGE_SIDE, height: image.naturalHeight || UNSIZED_IMAGE_SIDE };
    const { width, height } = blob.type === SVG ? vectorRasterSize(natural, layout) : natural;
    const canvas = new OffscreenCanvas(width, height);
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
  const withCopies = { ...job, thumbnail: options.thumbnail, preview: options.preview, sourcePreview: options.sourcePreview };
  // One pool for both attempts: after unload it refuses the fallback and frees its bitmap
  const workers = workerPool();
  try {
    return await workers.run({ ...withCopies, source }, run);
  } catch (error) {
    if (!(error instanceof ImageDecodeError)) throw error;
    return afterEarlierRasters(async () => {
      options.signal?.throwIfAborted();
      const bitmap = await rasterize(source, job.layout);
      return workers.run({ ...withCopies, source: bitmap }, { ...run, cost: jobCost(bitmap), transfer: [bitmap] });
    });
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
