/**
 * Grid-type and rough cell-size hypotheses from the power spectrum of a map's
 * line structure.
 *
 * A square grid puts its energy on the two frequency axes. A hex lattice with
 * centre spacing S has six reciprocal-lattice peaks at radius 2 / (sqrt(3) S):
 * perpendicular to the rows of centres, so at 30° + k·60° for pointy-top hexes
 * and at k·60° for flat-top hexes. Peaks are scored against the median power on
 * the same ring so texture and low-frequency content do not masquerade as grids.
 * The strongest peak may be a harmonic (honeycombs have weak fundamentals), so
 * the caller decides between the size, its half and its double by line evidence.
 */

import type { GridType } from '../../grid/GridSystem';

export interface SpectralHypothesis {
  gridType: GridType;
  /** Cell size in pixels of the analysed image (flat-to-flat for hexes). */
  cellSize: number;
  /** Mean peak power divided by the median power on the same frequency ring. */
  peakRatio: number;
  /** Radius (in spectrum bins) of the ring the size was read from. */
  ringFrequency: number;
}

const SQRT3 = Math.sqrt(3);
const RING_SAMPLES = 72;
const K_STEP = 0.25;
/** A ring must beat its background by this much to count at all. */
const MIN_RING_RATIO = 6;
/** ...and be at least this fraction of the strongest ring of its type. */
const RING_SIGNIFICANCE = 0.15;
/** Rings whose frequencies differ by less than this are the same ring seen by two types. */
const SAME_RING_TOLERANCE = 0.08;

const SQUARE_ANGLES = [0, 90, 180, 270].map((deg) => (deg * Math.PI) / 180);
const FLAT_ANGLES = [0, 60, 120, 180, 240, 300].map((deg) => (deg * Math.PI) / 180);
const POINTY_ANGLES = [30, 90, 150, 210, 270, 330].map((deg) => (deg * Math.PI) / 180);

function readPower(power: Float32Array, n: number, fx: number, fy: number): number {
  const x = fx + n / 2;
  const y = fy + n / 2;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= n || y0 + 1 >= n) return 0;
  const tx = x - x0;
  const ty = y - y0;
  const i = y0 * n + x0;
  const top = power[i]! * (1 - tx) + power[i + 1]! * tx;
  const bottom = power[i + n]! * (1 - tx) + power[i + n + 1]! * tx;
  return top * (1 - ty) + bottom * ty;
}

function ringMedian(power: Float32Array, n: number, k: number): number {
  const samples: number[] = [];
  for (let i = 0; i < RING_SAMPLES; i++) {
    const angle = (2 * Math.PI * i) / RING_SAMPLES;
    samples.push(readPower(power, n, k * Math.cos(angle), k * Math.sin(angle)));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

function peakRatioAt(power: Float32Array, n: number, k: number, angles: number[]): number {
  const background = ringMedian(power, n, k);
  if (background <= 0) return 0;
  let sum = 0;
  for (const angle of angles) sum += readPower(power, n, k * Math.cos(angle), k * Math.sin(angle));
  return sum / angles.length / background;
}

function cellSizeFromFrequency(gridType: GridType, n: number, k: number): number {
  return gridType === 'square' ? n / k : (2 * n) / (SQRT3 * k);
}

/**
 * Innermost significant ring for a grid type. Harmonics and outer reciprocal
 * shells are stronger than the fundamental for thin honeycomb lines, but the
 * fundamental is always the ring closest to the origin.
 */
function innermostRing(
  power: Float32Array,
  n: number,
  gridType: GridType,
  angles: number[],
  kMin: number,
  kMax: number,
): SpectralHypothesis | null {
  const ks: number[] = [];
  const ratios: number[] = [];
  for (let k = kMin; k <= kMax; k += K_STEP) {
    ks.push(k);
    ratios.push(peakRatioAt(power, n, k, angles));
  }
  const maxRatio = Math.max(...ratios);
  const threshold = Math.max(MIN_RING_RATIO, RING_SIGNIFICANCE * maxRatio);

  for (let i = 1; i < ratios.length - 1; i++) {
    const ratio = ratios[i]!;
    if (ratio >= threshold && ratio > ratios[i - 1]! && ratio >= ratios[i + 1]!) {
      return { gridType, cellSize: cellSizeFromFrequency(gridType, n, ks[i]!), peakRatio: maxRatio, ringFrequency: ks[i]! };
    }
  }
  return null;
}

/**
 * Best hypothesis per grid type, most plausible first. `minPeriod`/`maxPeriod` bound
 * the line spacing (in analysed pixels) considered plausible.
 */
export function spectralHypotheses(
  power: Float32Array,
  n: number,
  minPeriod: number,
  maxPeriod: number,
): SpectralHypothesis[] {
  const kMin = n / maxPeriod;
  const kMax = Math.min(n / minPeriod, n / 2 - 2);
  const hypotheses = [
    innermostRing(power, n, 'square', SQUARE_ANGLES, kMin, kMax),
    innermostRing(power, n, 'hex-vertical', POINTY_ANGLES, kMin, kMax),
    innermostRing(power, n, 'hex-horizontal', FLAT_ANGLES, kMin, kMax),
  ].filter((h): h is SpectralHypothesis => h !== null);

  // The true lattice owns the innermost ring; on a shared ring, the type whose
  // angle set matches best has the higher ratio.
  return hypotheses.sort((a, b) => {
    if (Math.abs(a.ringFrequency - b.ringFrequency) > SAME_RING_TOLERANCE * Math.max(a.ringFrequency, b.ringFrequency)) {
      return a.ringFrequency - b.ringFrequency;
    }
    return b.peakRatio - a.peakRatio;
  });
}
