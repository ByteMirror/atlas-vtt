/**
 * Automatic grid detection from the map image: spectral analysis proposes the
 * grid type and a rough cell size, line-evidence refinement makes it precise.
 */

import type { Sprite } from 'pixi.js';
import type { AlignmentResult } from '../gridAlignmentMath';
import { powerSpectrum2D } from './fft';
import { downsampleGray, grayFromCanvasSource, localContrast, toWindowedSquare } from './grayImage';
import type { GrayImage } from './grayImage';
import { spectralHypotheses } from './spectralHypotheses';
import { coarseRefine, finishRefine } from './refineGrid';
import type { CoarseGrid, RefinedGrid } from './refineGrid';

const SPECTRUM_SIZE = 512;
/** Plausible line spacing in spectrum pixels. */
const MIN_PERIOD = 4;
const MAX_PERIOD = SPECTRUM_SIZE / 4;
/** Longest side of the analysed image; larger maps are scaled down before detection. */
const MAX_ANALYSIS_SIDE = 4096;
/** Peak-to-background ratio below which the map is reported as having no grid. */
export const MIN_CONFIDENCE = 6;
/** A smaller candidate size wins over a larger one when its line evidence is at least this fraction of the best. */
const DENSER_GRID_PREFERENCE = 0.9;

/**
 * Detects the grid in a luminance image. Coordinates and sizes are in image pixels;
 * `confidence` is the spectral peak-to-background ratio.
 */
export function detectGridInImage(image: GrayImage): (RefinedGrid & { confidence: number }) | null {
  const factor = Math.max(1, Math.ceil(Math.max(image.width, image.height) / SPECTRUM_SIZE));
  const small = downsampleGray(image, factor);
  const spectrum = powerSpectrum2D(toWindowedSquare(localContrast(small, 1), SPECTRUM_SIZE), SPECTRUM_SIZE);

  const best = spectralHypotheses(spectrum, SPECTRUM_SIZE, MIN_PERIOD, MAX_PERIOD)[0];
  if (!best || best.peakRatio < MIN_CONFIDENCE) return null;

  // The strongest spectral peak may be a harmonic: let the line evidence choose
  // between the implied size, its half and its double.
  const roughSize = best.cellSize * factor;
  const maxSize = Math.min(image.width, image.height) / 3;
  const candidates = [roughSize * 2, roughSize, roughSize / 2]
    .filter((size) => size >= MIN_PERIOD * factor && size <= maxSize)
    .map((size) => coarseRefine(image, best.gridType, size))
    .filter((coarse): coarse is CoarseGrid => coarse !== null);
  if (candidates.length === 0) return null;

  const bestScore = Math.max(...candidates.map((c) => c.foldScore));
  const chosen = candidates
    .filter((c) => c.foldScore >= DENSER_GRID_PREFERENCE * bestScore)
    .sort((a, b) => a.candidate.cellSize - b.candidate.cellSize)[0]!;
  return { ...finishRefine(image, chosen), confidence: best.peakRatio };
}

function readBackgroundGray(sprite: Sprite): GrayImage | null {
  if (sprite.destroyed) return null;
  const source = sprite.texture?.source;
  const resource = (source as unknown as { resource?: CanvasImageSource } | undefined)?.resource;
  if (!source || !resource || source.pixelWidth < 64 || source.pixelHeight < 64) return null;
  return grayFromCanvasSource(resource, source.pixelWidth, source.pixelHeight, MAX_ANALYSIS_SIDE);
}

/** Detects the grid of a background sprite and returns it in world coordinates. */
export function detectGridFromSprite(sprite: Sprite): AlignmentResult | null {
  const image = readBackgroundGray(sprite);
  if (!image) return null;

  const detected = detectGridInImage(image);
  if (!detected) return null;

  const worldPerPixel = sprite.width / image.width;
  const round2 = (value: number): number => Math.round(value * 100) / 100;
  // Detected offsets index pixels; a pixel's centre is half a pixel further in continuous world space.
  return {
    gridType: detected.gridType,
    cellSize: round2(detected.cellSize * worldPerPixel),
    offsetX: round2(sprite.x + (detected.offsetX + 0.5) * worldPerPixel),
    offsetY: round2(sprite.y + (detected.offsetY + 0.5) * worldPerPixel),
    confidence: round2(detected.confidence),
  };
}
