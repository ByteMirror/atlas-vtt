import type { OptimizedImageResult } from '../../../../utils/imageOptimizer';

export type CreatorMode = 'token' | 'map';

export interface EditTokenInput {
  showRing?: boolean;
  size?: number | undefined;
  id: string;
  name: string;
  imageUrl: string;
  imagePath?: string | undefined;
  tags: string[];
}

/** Offset of the image centre from the well centre, as a fraction of the well width. */
export interface ImagePosition {
  x: number;
  y: number;
}

export interface PreviewImage {
  file: File;
  tags?: string[];
  showRing?: boolean;
  size?: number | undefined;
  name?: string;
  statblockPath?: string;
}

export interface TokenPreview {
  tags?: string[];
  statblockPath?: string;
  showRing?: boolean;
  /** Default footprint saved on the asset; undefined keeps 1×1. */
  size?: number | undefined;
  id: string;
  /** Original upload; null when editing an existing asset without replacing its image. */
  file: File | null;
  optimizedFile?: Blob;
  previewUrl: string;
  name: string;
  imageScale: number;
  imagePosition: ImagePosition;
  isSelected: boolean;
  isOptimizing: boolean;
  optimizationResult?: OptimizedImageResult;
}

export type TokenPreviewPatch = Partial<Pick<TokenPreview, 'name' | 'imageScale' | 'imagePosition' | 'showRing' | 'size' | 'tags'>>;

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;

export function clampZoom(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

export function modeNoun(mode: CreatorMode, count: number): string {
  const singular = mode === 'map' ? 'map' : 'token';
  return count === 1 ? singular : `${singular}s`;
}
