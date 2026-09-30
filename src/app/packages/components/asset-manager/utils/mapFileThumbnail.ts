import { MAP_THUMBNAIL_SIZE, coverCanvas } from '../../../../services/MapThumbnailService';

/**
 * A scene's thumbnail is normally rendered from the map view, which means a scene
 * made by dropping a file has no card image until someone opens it. These take the
 * still straight from the dropped file instead, so the card is right away what the
 * map looks like. The scene still re-renders its own thumbnail once it is opened.
 */

/** How far into an animated map the still is taken; past any fade-in, before anything moves far. */
const VIDEO_STILL_SECONDS = 0.5;
/** A map that will not decode must not hold up the import; the scene simply opens without a card image. */
const VIDEO_TIMEOUT_MS = 2500;
const IMAGE_TIMEOUT_MS = 2000;
/** Matches the scene cards; a still from the file is framed exactly as a rendered one. */
const STILL_QUALITY = 0.8;

/** Rejects if `promise` has not settled in `ms`, so a media element that never fires cannot hang the drop. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    promise.then(resolve, reject).finally(() => window.clearTimeout(timer));
  });
}

/** Settles on the first of `event` (resolve) or `error` (reject) the element fires. */
function firstEvent(element: HTMLMediaElement | HTMLImageElement, event: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    element.addEventListener(event, () => resolve(), { once: true });
    element.addEventListener('error', () => reject(new Error(`could not decode the map`)), { once: true });
  });
}

/** The first frame of an animated map, as a element ready to draw. */
async function decodeVideo(url: string): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  const video = createEl('video');
  video.muted = true;
  video.preload = 'auto';
  // A frame only exists once the element has data; seeking then moves past any fade-in.
  const ready = firstEvent(video, 'loadeddata');
  video.src = url;
  await withTimeout(ready, VIDEO_TIMEOUT_MS, 'reading the animated map');

  const seeked = firstEvent(video, 'seeked');
  video.currentTime = Math.min(VIDEO_STILL_SECONDS, (video.duration || 0) / 2);
  await withTimeout(seeked, VIDEO_TIMEOUT_MS, 'reading the animated map');

  return { source: video, width: video.videoWidth, height: video.videoHeight };
}

async function decodeImage(url: string): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  const image = createEl('img');
  const ready = firstEvent(image, 'load');
  image.src = url;
  await withTimeout(ready, IMAGE_TIMEOUT_MS, 'reading the map');

  return { source: image, width: image.naturalWidth, height: image.naturalHeight };
}

/** The canvas as JPEG bytes, the format every thumbnail is stored in. */
function encodeJpeg(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    canvas.toBlob(
      (blob) => { if (blob) resolve(blob.arrayBuffer()); else reject(new Error('could not encode the thumbnail')); },
      'image/jpeg',
      STILL_QUALITY
    );
  });
}

/**
 * A card-sized still of a dropped map, as JPEG bytes, or null when it could not be
 * read. A thumbnail is a nicety next to the import itself, so every failure here is
 * reported and swallowed rather than losing the map the drop was for.
 */
export async function mapFileThumbnail(file: File, isVideo: boolean): Promise<ArrayBuffer | null> {
  const url = URL.createObjectURL(file);
  try {
    const { source, width, height } = isVideo ? await decodeVideo(url) : await decodeImage(url);
    if (width <= 0 || height <= 0) return null;
    return await encodeJpeg(coverCanvas(source, { width, height }, MAP_THUMBNAIL_SIZE));
  } catch (error) {
    console.error('[Atlas] Could not make a thumbnail of the dropped map', file.name, error);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
