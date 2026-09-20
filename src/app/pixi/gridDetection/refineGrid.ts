/**
 * Precise cell size and offset for a grid hypothesis.
 *
 * The map's line-contrast image is folded into a single lattice cell: every pixel
 * is accumulated at its position modulo the lattice, so one pass over the image
 * scores every possible offset at once and uses every pixel as evidence. Folding
 * at coarse resolution finds the phase, folding the whole map at mid resolution
 * pins the size down with a long baseline, and a final sub-pixel search at full
 * resolution polishes both. The line template comes from the real grid drawers.
 */

import type { GridType } from '../../grid/GridSystem';
import { axialToPixel, createHexLayout, hexCellExtent, hexCircumradius, isHexGridType, pixelToAxial } from '../../grid/hexGeometry';
import { downsampleGray, localContrast, sampleBilinear } from './grayImage';
import type { GrayImage } from './grayImage';
import { gridLineSamples } from './gridTemplate';
import type { LineSample } from './gridTemplate';

export interface RefinedGrid {
  gridType: GridType;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  /** Mean line centredness along the detected grid at full resolution; comparable between candidates on the same image. */
  score: number;
}

interface Candidate {
  cellSize: number;
  offsetX: number;
  offsetY: number;
}

interface SizeSteps {
  count: number;
  step: number;
}

const COARSE_SIZE_STEPS: SizeSteps = { count: 6, step: 0.005 };
const MID_SIZE_STEPS: SizeSteps = { count: 10, step: 0.001 };
const FINE_SIZE_STEPS: SizeSteps = { count: 6, step: 0.0004 };
const POLISH_SIZE_STEPS: SizeSteps = { count: 3, step: 0.0001 };

const mod = (value: number, period: number): number => ((value % period) + period) % period;

function sizeCandidates(center: number, steps: SizeSteps): number[] {
  const sizes: number[] = [];
  for (let i = -steps.count; i <= steps.count; i++) sizes.push(center * (1 + i * steps.step));
  return sizes;
}

/** Extent of the offsets that produce distinct grids (one fundamental lattice cell). */
function cellDomain(gridType: GridType, cellSize: number): { width: number; height: number } {
  if (!isHexGridType(gridType)) return { width: cellSize, height: cellSize };
  const rowSpacing = 1.5 * hexCircumradius(cellSize);
  return gridType === 'hex-vertical' ? { width: cellSize, height: rowSpacing } : { width: rowSpacing, height: cellSize };
}

/**
 * Fold geometry: `(x, y)` maps to its position inside the fundamental cell. Hex
 * lattices shift alternate rows (pointy) or columns (flat) by half a cell.
 */
interface FoldGeometry {
  width: number;
  height: number;
  /** Row (pointy) / column (flat) spacing; the cell size itself for squares. */
  stride: number;
  shift: number;
  mode: 'square' | 'rows' | 'columns';
}

function foldGeometry(gridType: GridType, cellSize: number): FoldGeometry {
  const domain = cellDomain(gridType, cellSize);
  if (!isHexGridType(gridType)) return { ...domain, stride: cellSize, shift: 0, mode: 'square' };
  return { ...domain, stride: 1.5 * hexCircumradius(cellSize), shift: cellSize / 2, mode: gridType === 'hex-vertical' ? 'rows' : 'columns' };
}

/** Bin index inside the folded cell for (x, y); `bins` is the folded cell's width. */
function foldIndex(g: FoldGeometry, bins: number, rows: number, x: number, y: number): number {
  let u: number;
  let v: number;
  if (g.mode === 'square') {
    u = mod(x, g.width);
    v = mod(y, g.height);
  } else if (g.mode === 'rows') {
    const row = Math.floor(y / g.stride);
    u = mod(x - row * g.shift, g.width);
    v = y - row * g.stride;
  } else {
    const column = Math.floor(x / g.stride);
    u = x - column * g.stride;
    v = mod(y - column * g.shift, g.height);
  }
  return Math.min(rows - 1, Math.floor(v)) * bins + Math.min(bins - 1, Math.floor(u));
}

/** Mean contrast per lattice-relative position, folded over the whole image. */
function foldImage(contrast: GrayImage, gridType: GridType, cellSize: number): GrayImage {
  const g = foldGeometry(gridType, cellSize);
  const width = Math.ceil(g.width);
  const height = Math.ceil(g.height);
  const sum = new Float32Array(width * height);
  const count = new Float32Array(width * height);

  for (let y = 0; y < contrast.height; y++) {
    const row = y * contrast.width;
    for (let x = 0; x < contrast.width; x++) {
      const i = foldIndex(g, width, height, x, y);
      sum[i] = sum[i]! + contrast.data[row + x]!;
      count[i] = count[i]! + 1;
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] = count[i]! > 0 ? sum[i]! / count[i]! : 0;
  return { width, height, data: sum };
}

/** One cell's worth of grid-line samples for the offset-0 grid. */
function cellTemplate(gridType: GridType, cellSize: number, spacing: number): LineSample[] {
  const domain = cellDomain(gridType, cellSize);
  return gridLineSamples(gridType, cellSize, 0, 0, { minX: 0, minY: 0, maxX: domain.width, maxY: domain.height }, spacing).filter(
    (s) => s.x >= 0 && s.y >= 0 && s.x < domain.width && s.y < domain.height,
  );
}

/** Best offset for one size, read off the folded cell. */
function bestOffsetInFold(fold: GrayImage, gridType: GridType, cellSize: number, template: LineSample[], step: number): {
  offsetX: number;
  offsetY: number;
  score: number;
} {
  const g = foldGeometry(gridType, cellSize);
  let best = { offsetX: 0, offsetY: 0, score: -1 };
  for (let oy = 0; oy < g.height; oy += step) {
    for (let ox = 0; ox < g.width; ox += step) {
      let sum = 0;
      for (const t of template) {
        sum += fold.data[foldIndex(g, fold.width, fold.height, t.x + ox, t.y + oy)]!;
      }
      const score = sum / template.length;
      if (score > best.score) best = { offsetX: ox, offsetY: oy, score };
    }
  }
  return best;
}

/** Fold-based search over sizes at a reduced resolution; returns the best candidate in full-resolution pixels. */
function foldSearch(image: GrayImage, factor: number, gridType: GridType, roughSize: number, steps: SizeSteps): { candidate: Candidate; score: number } | null {
  const contrast = localContrast(downsampleGray(image, factor), 1);
  let best: Candidate | null = null;
  let bestScore = -1;
  for (const cellSize of sizeCandidates(roughSize / factor, steps)) {
    if (cellSize < 3) continue;
    const fold = foldImage(contrast, gridType, cellSize);
    const found = bestOffsetInFold(fold, gridType, cellSize, cellTemplate(gridType, cellSize, 1), 1);
    if (found.score > bestScore) {
      bestScore = found.score;
      // A level pixel covers `factor` source pixels; its centre sits (factor - 1) / 2 past the first one.
      const centre = (factor - 1) / 2;
      best = { cellSize: cellSize * factor, offsetX: found.offsetX * factor + centre, offsetY: found.offsetY * factor + centre };
    }
  }
  return best ? { candidate: best, score: bestScore } : null;
}

/** Half-width of the probe across a line at full resolution; lines thicker than twice this lose contrast. */
const LINE_PROBE = 3;

/**
 * Centredness of a line under a sample: contrast between the point and its two
 * flanks, minus the flank asymmetry. The penalty makes the score peak sharply
 * at a line's centre instead of plateauing across its whole thickness.
 */
function lineCentredness(image: GrayImage, s: LineSample, x: number, y: number): number {
  const on = sampleBilinear(image, x, y);
  const a = sampleBilinear(image, x + s.nx * LINE_PROBE, y + s.ny * LINE_PROBE);
  const b = sampleBilinear(image, x - s.nx * LINE_PROBE, y - s.ny * LINE_PROBE);
  return Math.abs(on - (a + b) / 2) - Math.abs(a - b);
}

/**
 * Joint size/offset search over the whole map at full resolution around `start`.
 * Size changes scale the grid about the image centre, so a size step does not
 * drag the phase away where the evidence is balanced.
 */
function localSearch(image: GrayImage, gridType: GridType, start: Candidate, steps: SizeSteps, reach: number, step: number): { best: Candidate; score: number } {
  const bounds = { minX: -start.cellSize, minY: -start.cellSize, maxX: image.width + start.cellSize, maxY: image.height + start.cellSize };
  const centerX = image.width / 2;
  const centerY = image.height / 2;
  let best = start;
  let bestScore = -1;
  for (const cellSize of sizeCandidates(start.cellSize, steps)) {
    const scale = cellSize / start.cellSize;
    const originX = centerX + (start.offsetX - centerX) * scale;
    const originY = centerY + (start.offsetY - centerY) * scale;
    const samples = gridLineSamples(gridType, cellSize, originX, originY, bounds, 10);
    for (let dy = -reach; dy <= reach + 1e-9; dy += step) {
      for (let dx = -reach; dx <= reach + 1e-9; dx += step) {
        let sum = 0;
        let count = 0;
        for (const s of samples) {
          const x = s.x + dx;
          const y = s.y + dy;
          if (x < LINE_PROBE + 1 || y < LINE_PROBE + 1 || x >= image.width - LINE_PROBE - 2 || y >= image.height - LINE_PROBE - 2) continue;
          sum += lineCentredness(image, s, x, y);
          count++;
        }
        const score = count > 0 ? sum / count : 0;
        if (score > bestScore) {
          bestScore = score;
          best = { cellSize, offsetX: originX + dx, offsetY: originY + dy };
        }
      }
    }
  }
  return { best, score: bestScore };
}

/** Keep offsets small: square offsets modulo the cell, hex offsets re-based to the hex containing the origin. */
function normaliseOffset(gridType: GridType, candidate: Candidate): Candidate {
  const { cellSize } = candidate;
  if (!isHexGridType(gridType)) return { cellSize, offsetX: mod(candidate.offsetX, cellSize), offsetY: mod(candidate.offsetY, cellSize) };
  const layout = createHexLayout(gridType, cellSize, candidate.offsetX, candidate.offsetY);
  const anchor = axialToPixel(layout, pixelToAxial(layout, { x: 0, y: 0 }));
  const extent = hexCellExtent(layout);
  return { cellSize, offsetX: anchor.x - extent.width / 2, offsetY: anchor.y - extent.height / 2 };
}

/** Result of the fold stages: a candidate good to about a pixel, plus the fold evidence it scored. */
export interface CoarseGrid {
  gridType: GridType;
  candidate: Candidate;
  /** Mean folded line contrast; comparable between candidate sizes on the same image. */
  foldScore: number;
}

/** Fold-based stages only: cheap enough to run for several candidate sizes. */
export function coarseRefine(image: GrayImage, gridType: GridType, roughCellSize: number): CoarseGrid | null {
  const longSide = Math.max(image.width, image.height);
  const coarseFactor = longSide > 2000 ? 8 : 4;
  const midFactor = longSide > 2000 ? 4 : 2;

  const coarse = foldSearch(image, coarseFactor, gridType, roughCellSize, COARSE_SIZE_STEPS);
  if (!coarse) return null;
  const mid = foldSearch(image, midFactor, gridType, coarse.candidate.cellSize, MID_SIZE_STEPS) ?? coarse;
  return { gridType, candidate: mid.candidate, foldScore: mid.score };
}

/** Full-resolution sub-pixel polish of a coarse result. */
export function finishRefine(image: GrayImage, coarse: CoarseGrid): RefinedGrid {
  const { gridType } = coarse;
  const fine = localSearch(image, gridType, coarse.candidate, FINE_SIZE_STEPS, 1, 0.5).best;
  const polished = localSearch(image, gridType, fine, POLISH_SIZE_STEPS, 0.25, 0.125);
  const { cellSize, offsetX, offsetY } = normaliseOffset(gridType, polished.best);
  return { gridType, cellSize, offsetX, offsetY, score: polished.score };
}

export function refineGrid(image: GrayImage, gridType: GridType, roughCellSize: number): RefinedGrid | null {
  const coarse = coarseRefine(image, gridType, roughCellSize);
  return coarse ? finishRefine(image, coarse) : null;
}
