/**
 * Sub-pixel lattice fit.
 *
 * Every cell edge of a candidate grid is measured on its own, which gives the
 * distance between where the grid predicts a line and where the map really has
 * one. Because every grid point is `origin + size * latticeCoordinate`, those
 * distances are linear in the three unknowns (size and the two offsets), so one
 * robust least-squares solve places the whole grid on thousands of measurements
 * at once. It is the manual alignment tool with every edge of the map clicked.
 *
 * Edges that are hidden or that lock on to map art are outliers; a Tukey weight
 * with a shrinking cutoff removes them, and the measuring window narrows from
 * pass to pass as the fit closes in.
 */

import type { GridType } from '../../grid/GridSystem';
import type { GrayImage } from './grayImage';
import { edgeDirectionKey, edgeResponse, edgeShift, latticeEdges, moveCandidate } from './edgeProfile';
import type { LatticeCandidate, LatticeEdge } from './edgeProfile';

interface EdgeMeasurement {
  edge: LatticeEdge;
  /** Signed distance along the normal from the predicted edge to the measured line. */
  shift: number;
  /** Line contrast at the measured position. */
  strength: number;
}

interface LatticeDelta {
  dx: number;
  dy: number;
  dSize: number;
}

/** Resolution of the profile measured across an edge. */
const PROFILE_STEP = 0.5;
/** Tightest outlier cutoff; measurements further than this from the fit carry no weight in the last solve. */
const MIN_CUTOFF = 0.75;
/** The measuring window may never reach the neighbouring line. */
const MAX_REACH_IN_CELLS = 0.3;
/** Upper bound on the edges measured per pass; a few thousand spread over the map already pin the lattice down to a hundredth of a pixel. */
const MAX_EDGES = 2500;
const REACH_SCHEDULE = [8, 4, 2];
/** Window used to tell real lines from chance hits when scoring a finished fit. */
const SUPPORT_REACH = 6;
/** Excess of on-line edges over chance, in standard deviations, below which support counts as zero. */
const MIN_SUPPORT_SIGMAS = 5;

/** Locates the line across one edge within `reach` pixels of its predicted position, to a fraction of a profile step. */
function measureEdge(image: GrayImage, edge: LatticeEdge, reach: number): EdgeMeasurement | null {
  const response = edgeResponse(image, edge, reach, PROFILE_STEP);
  let peak = -1;
  let strength = 0;
  for (let j = 0; j < response.length; j++) {
    if (response[j]! > strength) {
      strength = response[j]!;
      peak = j;
    }
  }
  // A peak on the window border is the flank of something outside the window.
  if (peak <= 0 || peak >= response.length - 1) return null;

  const before = response[peak - 1]!;
  const after = response[peak + 1]!;
  const curvature = before - 2 * strength + after;
  const subStep = curvature < 0 ? (0.5 * (before - after)) / curvature : 0;
  return { edge, shift: (peak - (response.length - 1) / 2 + subStep) * PROFILE_STEP, strength };
}

function measureEdges(image: GrayImage, edges: LatticeEdge[], reach: number): EdgeMeasurement[] {
  return edges.map((edge) => measureEdge(image, edge, reach)).filter((m): m is EdgeMeasurement => m !== null);
}

/** Weighted least squares for the three lattice unknowns (3×3 normal equations, Cramer's rule). */
function solveLattice(measurements: EdgeMeasurement[], weights: Float64Array): LatticeDelta | null {
  const ata = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const atb = [0, 0, 0];
  measurements.forEach((m, i) => {
    const w = weights[i]!;
    if (w <= 0) return;
    const row = [m.edge.nx, m.edge.ny, edgeShift(m.edge, 0, 0, 1)];
    for (let r = 0; r < 3; r++) {
      atb[r] = atb[r]! + w * row[r]! * m.shift;
      for (let c = 0; c < 3; c++) ata[r * 3 + c] = ata[r * 3 + c]! + w * row[r]! * row[c]!;
    }
  });

  const det3 = (m: number[]): number =>
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) - m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) + m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!);
  const det = det3(ata);
  if (Math.abs(det) < 1e-9) return null;
  const withColumn = (column: number): number[] => ata.map((value, i) => (i % 3 === column ? atb[Math.floor(i / 3)]! : value));
  return { dx: det3(withColumn(0)) / det, dy: det3(withColumn(1)) / det, dSize: det3(withColumn(2)) / det };
}

/** Robust solve on one set of measurements: the outlier cutoff shrinks from the window size to a sub-pixel band. */
function robustDelta(measurements: EdgeMeasurement[], reach: number): LatticeDelta {
  const strengths = measurements.map((m) => m.strength).sort((a, b) => a - b);
  const strongEdge = strengths[Math.floor(strengths.length * 0.75)] ?? 1;

  let delta: LatticeDelta = { dx: 0, dy: 0, dSize: 0 };
  const weights = new Float64Array(measurements.length);
  for (const cutoff of [reach, reach / 2, Math.max(reach / 4, MIN_CUTOFF), MIN_CUTOFF]) {
    measurements.forEach((m, i) => {
      const u = (m.shift - edgeShift(m.edge, delta.dx, delta.dy, delta.dSize)) / cutoff;
      weights[i] = Math.abs(u) < 1 ? (1 - u * u) ** 2 * Math.min(1, m.strength / strongEdge) : 0;
    });
    delta = solveLattice(measurements, weights) ?? delta;
  }
  return delta;
}

function clampReach(reach: number, cellSize: number): number {
  return Math.max(1.5, Math.min(reach, cellSize * MAX_REACH_IN_CELLS));
}

/**
 * Share of the grid's edges that have a line exactly where the grid predicts one,
 * corrected for chance: a peak found anywhere in the window lands inside the
 * tolerance band `tolerance / reach` of the time even on a map without a grid.
 * 0 means no better than chance, 1 means every edge of the grid is on a line.
 * The weakest edge direction counts: a grid of another type can share the lines
 * of one direction, but not of all of them. Longer edges average more of the map
 * and find fainter lines, so grids of different sizes are only comparable when
 * measured with the same `edgeLength`.
 */
export function latticeSupport(image: GrayImage, gridType: GridType, candidate: LatticeCandidate, edgeLength: number = candidate.cellSize): number {
  const reach = clampReach(SUPPORT_REACH, candidate.cellSize);
  const chance = MIN_CUTOFF / reach;
  const edges = latticeEdges(image, gridType, candidate, reach, MAX_EDGES, edgeLength);
  const onLine = new Set(measureEdges(image, edges, reach).filter((m) => Math.abs(m.shift) < MIN_CUTOFF).map((m) => m.edge));

  const directions = new Map<number, { edges: number; onLine: number }>();
  for (const edge of edges) {
    const key = edgeDirectionKey(edge);
    const tally = directions.get(key) ?? { edges: 0, onLine: 0 };
    tally.edges++;
    if (onLine.has(edge)) tally.onLine++;
    directions.set(key, tally);
  }

  let support = directions.size > 0 ? 1 : 0;
  for (const tally of directions.values()) {
    const excess = tally.onLine / tally.edges - chance;
    // With few edges a handful of chance hits looks like a grid; demand a clear excess over the binomial noise.
    const noise = Math.sqrt((chance * (1 - chance)) / tally.edges);
    support = Math.min(support, excess < MIN_SUPPORT_SIGMAS * noise ? 0 : excess / (1 - chance));
  }
  return support;
}

export interface LatticeFit {
  candidate: LatticeCandidate;
  support: number;
}

/** Refines a candidate that is good to a few pixels into a sub-pixel fit over the whole map. */
export function fitLattice(image: GrayImage, gridType: GridType, start: LatticeCandidate): LatticeFit {
  let candidate = start;
  for (const scheduled of REACH_SCHEDULE) {
    const reach = clampReach(scheduled, candidate.cellSize);
    const measurements = measureEdges(image, latticeEdges(image, gridType, candidate, reach, MAX_EDGES), reach);
    if (measurements.length < 3) break;
    const delta = robustDelta(measurements, reach);
    candidate = moveCandidate(image, candidate, delta.dx, delta.dy, delta.dSize);
  }
  return { candidate, support: latticeSupport(image, gridType, candidate) };
}
