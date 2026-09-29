import type { FramePlacement } from './imageJob';

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  left: number;
  top: number;
}

/** `size` scaled down to fit within the bounds, keeping its aspect ratio; never scaled up. */
export function fitWithin(size: Size, maxWidth: number, maxHeight: number): Size {
  const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** Pixel size of a square frame: as many pixels as the source has across it, clamped to the bounds. */
export function frameSize(source: Size, placement: FramePlacement, minSize: number, maxSize: number): number {
  const sourcePixels = Math.round(source.width / placement.width);
  return Math.min(maxSize, Math.max(minSize, sourcePixels));
}

/** Where the image is drawn in a square frame of `frame` pixels. */
export function frameImageRect(source: Size, placement: FramePlacement, frame: number): Rect {
  const width = placement.width * frame;
  const height = width * (source.height / source.width);
  return {
    left: placement.centerX * frame - width / 2,
    top: placement.centerY * frame - height / 2,
    width,
    height,
  };
}
