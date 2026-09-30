import type { TextureSource } from 'pixi.js';

/**
 * Whether `source` uploads from a video element. Such a source re-uploads on every
 * decoded frame, which both the texture cache and the render scheduler have to allow for.
 */
export function isVideoSource(source: TextureSource): boolean {
  return source.uploadMethodId === 'video'
    || (typeof HTMLVideoElement !== 'undefined' && source.resource instanceof HTMLVideoElement);
}

/** The video element behind `source`, or null when it does not upload from one. */
export function videoElementOf(source: TextureSource): HTMLVideoElement | null {
  if (typeof HTMLVideoElement === 'undefined') return null;
  return source.resource instanceof HTMLVideoElement ? source.resource : null;
}
