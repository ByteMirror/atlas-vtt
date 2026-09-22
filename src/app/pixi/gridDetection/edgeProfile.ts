/**
 * Cell edges of a candidate grid and the line evidence across them.
 *
 * The image is averaged along an edge before anything is rectified, so a faint
 * line adds up coherently over the edge's length while texture averages out.
 * Both the lattice search and the lattice fit read the map through these profiles.
 */

import type { GridType } from '../../grid/GridSystem';
import { sampleBilinear } from './grayImage';
import type { GrayImage } from './grayImage';
import { gridLineSegments } from './gridTemplate';

export interface LatticeCandidate {
  cellSize: number;
  offsetX: number;
  offsetY: number;
}

export interface LatticeEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Unit normal of the edge. */
  nx: number;
  ny: number;
  /** Edge midpoint relative to the image centre, in cells. */
  cx: number;
  cy: number;
}

/** Distance between a line's centre and the flanks it is compared with; lines thicker than twice this lose contrast. */
const LINE_PROBE = 3;
/** Spacing of the samples averaged along an edge. */
const ALONG_STEP = 2;
/** Ends of an edge are left out: crossing lines and hex vertices disturb the profile there. */
const EDGE_TRIM = 0.1;

/**
 * Edges of the candidate grid whose whole measuring window (`reach` to either side)
 * lies inside the image, thinned evenly to at most `maxEdges`. Long lines are split
 * into edges of `edgeLength` (one cell by default) so a partly hidden line still
 * yields clean measurements.
 */
export function latticeEdges(
  image: GrayImage,
  gridType: GridType,
  candidate: LatticeCandidate,
  reach: number,
  maxEdges: number,
  edgeLength: number = candidate.cellSize,
): LatticeEdge[] {
  const { cellSize, offsetX, offsetY } = candidate;
  const margin = reach + LINE_PROBE + 2;
  const inside = (x: number, y: number): boolean => x >= margin && y >= margin && x < image.width - margin && y < image.height - margin;

  const edges: LatticeEdge[] = [];
  for (const s of gridLineSegments(gridType, cellSize, offsetX, offsetY, { minX: 0, minY: 0, maxX: image.width, maxY: image.height })) {
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const pieces = Math.max(1, Math.round(length / edgeLength));
    if (length / pieces < 2 * ALONG_STEP) continue;
    // One sign convention per direction, whichever way the drawer happened to trace the edge.
    const flip = s.y1 - s.y2 < -1e-9 || (Math.abs(s.y1 - s.y2) <= 1e-9 && s.x2 - s.x1 < 0) ? -1 : 1;
    const nx = (flip * (s.y1 - s.y2)) / length;
    const ny = (flip * (s.x2 - s.x1)) / length;
    for (let i = 0; i < pieces; i++) {
      const x1 = s.x1 + ((s.x2 - s.x1) * i) / pieces;
      const y1 = s.y1 + ((s.y2 - s.y1) * i) / pieces;
      const x2 = s.x1 + ((s.x2 - s.x1) * (i + 1)) / pieces;
      const y2 = s.y1 + ((s.y2 - s.y1) * (i + 1)) / pieces;
      if (!inside(x1, y1) || !inside(x2, y2)) continue;
      const cx = ((x1 + x2) / 2 - image.width / 2) / cellSize;
      const cy = ((y1 + y2) / 2 - image.height / 2) / cellSize;
      edges.push({ x1, y1, x2, y2, nx, ny, cx, cy });
    }
  }
  const stride = Math.max(1, edges.length / maxEdges);
  return stride === 1 ? edges : Array.from({ length: maxEdges }, (_, i) => edges[Math.floor(i * stride)]!);
}

/**
 * Line response at every `step` across an edge, from `-reach` to `+reach` along its
 * normal (index `reach / step` is the edge itself). The response is the contrast
 * between a point and its two flanks minus the flank asymmetry, so lines of either
 * polarity peak at their centre and plain steps in brightness do not count.
 */
export function edgeResponse(image: GrayImage, edge: LatticeEdge, reach: number, step: number): Float32Array {
  const probe = Math.round(LINE_PROBE / step);
  const half = Math.round(reach / step);
  const profile = new Float32Array(2 * (half + probe) + 1);
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const count = Math.max(2, Math.floor((Math.hypot(dx, dy) * (1 - 2 * EDGE_TRIM)) / ALONG_STEP));
  for (let i = 0; i < count; i++) {
    const t = EDGE_TRIM + ((1 - 2 * EDGE_TRIM) * (i + 0.5)) / count;
    const px = edge.x1 + dx * t;
    const py = edge.y1 + dy * t;
    for (let j = 0; j < profile.length; j++) {
      const d = (j - half - probe) * step;
      profile[j] = profile[j]! + sampleBilinear(image, px + edge.nx * d, py + edge.ny * d);
    }
  }

  const response = new Float32Array(2 * half + 1);
  for (let j = 0; j < response.length; j++) {
    const on = profile[j + probe]!;
    const a = profile[j]!;
    const b = profile[j + 2 * probe]!;
    response[j] = (Math.abs(on - (a + b) / 2) - Math.abs(a - b)) / count;
  }
  return response;
}

/**
 * Key shared by all edges of one direction: `latticeEdges` gives the edges of a
 * direction one common normal, and a line direction only counts modulo 180°.
 */
export function edgeDirectionKey(edge: LatticeEdge): number {
  const degrees = Math.round((Math.atan2(edge.ny, edge.nx) * 180) / Math.PI);
  return ((degrees % 180) + 180) % 180;
}

/** How far a change of offset and size moves an edge along its normal. */
export function edgeShift(edge: LatticeEdge, dx: number, dy: number, dSize: number): number {
  return edge.nx * dx + edge.ny * dy + (edge.nx * edge.cx + edge.ny * edge.cy) * dSize;
}

/** Size changes scale the grid about the image centre, where the edge coordinates are measured from. */
export function moveCandidate(image: GrayImage, candidate: LatticeCandidate, dx: number, dy: number, dSize: number): LatticeCandidate {
  const cellSize = candidate.cellSize + dSize;
  const scale = cellSize / candidate.cellSize;
  const centerX = image.width / 2;
  const centerY = image.height / 2;
  return {
    cellSize,
    offsetX: centerX + (candidate.offsetX - centerX) * scale + dx,
    offsetY: centerY + (candidate.offsetY - centerY) * scale + dy,
  };
}
