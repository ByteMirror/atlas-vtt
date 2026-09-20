import type { ImagePosition } from './types';

/** Diameter of the circular token crop as a fraction of the well. Mirrors the 10% mask inset in _card.scss. */
export const TOKEN_CROP_FRACTION = 0.8;

export interface ImageAspect {
  width: number;
  height: number;
}

/** Image rectangle in well units (1 = well width), origin at the well's top-left. */
export interface RenderedImageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Where the image sits in the well: `scale` wide, natural aspect, centred plus the drag offset. */
export function renderedImageRect(scale: number, position: ImagePosition, aspect: ImageAspect | null): RenderedImageRect {
  const width = scale;
  const height = aspect ? scale * (aspect.height / aspect.width) : scale;
  return { left: 0.5 + position.x - width / 2, top: 0.5 + position.y - height / 2, width, height };
}

/**
 * Keeps the image covering the centre of the crop: at high zoom every part of
 * it can be dragged into the circle, and at any zoom it can never leave it.
 */
export function clampImagePosition(position: ImagePosition, scale: number, aspect: ImageAspect | null): ImagePosition {
  const { width, height } = renderedImageRect(scale, position, aspect);
  return { x: clamp(position.x, width / 2), y: clamp(position.y, height / 2) };
}
