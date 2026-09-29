import type { FramePlacement } from '../../../../imageProcessing/imageProcessing';
import type { ImagePosition, TokenPreview, TokenPreviewPatch } from './types';

/** Diameter of the circular token crop as a fraction of the well. Mirrors the 10% mask inset in _card.scss. */
export const TOKEN_CROP_FRACTION = 0.8;

/**
 * Zoom at which a whole image spans the crop circle. A ringed token shows its stored
 * image that way on the map, so editing one starts here.
 */
export const STORED_IMAGE_SCALE = TOKEN_CROP_FRACTION;

/**
 * The framing a preview starts at and resets to: a new upload fills the well, an edited
 * token's stored image shows as it is. Resetting an edit to any other zoom would count as
 * a new crop and overwrite the token's own image on save.
 */
export function cropReset(preview: Pick<TokenPreview, 'file'>): Required<Pick<TokenPreviewPatch, 'imageScale' | 'imagePosition'>> {
  return { imageScale: preview.file ? 1 : STORED_IMAGE_SCALE, imagePosition: { x: 0, y: 0 } };
}

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

/**
 * Where the image sits in the square around the token circle, the area a
 * token image keeps: `renderedImageRect` expressed in units of that square.
 */
export function tokenCropPlacement(scale: number, position: ImagePosition): FramePlacement {
  const cropOrigin = (1 - TOKEN_CROP_FRACTION) / 2;
  const { left, top, width, height } = renderedImageRect(scale, position, null);
  return {
    centerX: (left + width / 2 - cropOrigin) / TOKEN_CROP_FRACTION,
    centerY: (top + height / 2 - cropOrigin) / TOKEN_CROP_FRACTION,
    width: width / TOKEN_CROP_FRACTION,
  };
}
