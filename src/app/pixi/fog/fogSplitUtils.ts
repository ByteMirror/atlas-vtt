/**
 * Fog splitting utilities — connected component detection and contour extraction.
 *
 * After an erase operation, the compositor canvas is analyzed to find
 * disconnected visual fog regions.  Each region is converted to a lasso
 * polygon so it becomes an independent selectable/deletable entity in the store.
 */
import type { FogBounds } from '../../types/fogTypes';

const ALPHA_THRESHOLD = 10;
const SIMPLIFY_TOLERANCE = 4; // pixels at canvas scale

interface ComponentBounds {
  label: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
}

// ── Connected component labeling (BFS flood fill) ───────────────────

export function labelComponents(
  imageData: ImageData,
  width: number,
  height: number
): { labels: Int32Array; components: ComponentBounds[] } {
  const totalPixels = width * height;
  const labels = new Int32Array(totalPixels).fill(-1);
  const components: ComponentBounds[] = [];
  let nextLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (imageData.data[idx * 4 + 3]! < ALPHA_THRESHOLD || labels[idx] !== -1) continue;

      // BFS flood fill
      const label = nextLabel++;
      const queue = [idx];
      labels[idx] = label;
      let minX = x, maxX = x, minY = y, maxY = y;
      let pixelCount = 1;

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const cx = cur % width;
        const cy = (cur - cx) / width;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        // 8-connected neighbors (diagonals included so thin angled
        // strokes rendered at half-res aren't falsely split)
        const neighbors = [
          cy > 0 ? cur - width : -1,
          cy < height - 1 ? cur + width : -1,
          cx > 0 ? cur - 1 : -1,
          cx < width - 1 ? cur + 1 : -1,
          cy > 0 && cx > 0 ? cur - width - 1 : -1,
          cy > 0 && cx < width - 1 ? cur - width + 1 : -1,
          cy < height - 1 && cx > 0 ? cur + width - 1 : -1,
          cy < height - 1 && cx < width - 1 ? cur + width + 1 : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && labels[n] === -1 && imageData.data[n * 4 + 3]! >= ALPHA_THRESHOLD) {
            labels[n] = label;
            queue.push(n);
            pixelCount++;
          }
        }
      }

      components.push({ label, minX, minY, maxX, maxY, pixelCount });
    }
  }

  return { labels, components };
}

// ── Scanline contour extraction ─────────────────────────────────────

/** Extract a polygon outline from a labeled component using scanline edges. */
export function componentToPolygon(
  labels: Int32Array,
  comp: ComponentBounds,
  width: number,
  canvasBounds: FogBounds,
  scale: number
): Array<{ x: number; y: number }> {
  const leftEdge: Array<{ x: number; y: number }> = [];
  const rightEdge: Array<{ x: number; y: number }> = [];

  for (let y = comp.minY; y <= comp.maxY; y++) {
    let rowMinX = -1;
    let rowMaxX = -1;

    for (let x = comp.minX; x <= comp.maxX; x++) {
      if (labels[y * width + x] === comp.label) {
        if (rowMinX === -1) rowMinX = x;
        rowMaxX = x;
      }
    }

    if (rowMinX !== -1) {
      // Convert pixel coords → world coords
      leftEdge.push({
        x: rowMinX / scale + canvasBounds.x,
        y: y / scale + canvasBounds.y,
      });
      rightEdge.push({
        x: (rowMaxX + 1) / scale + canvasBounds.x,
        y: y / scale + canvasBounds.y,
      });
    }
  }

  // Close the polygon: left edge top→bottom, right edge bottom→top
  return simplifyPolygon([...leftEdge, ...rightEdge.reverse()], SIMPLIFY_TOLERANCE / scale);
}

// ── Douglas-Peucker polygon simplification ──────────────────────────

export function simplifyPolygon(
  points: Array<{ x: number; y: number }>,
  tolerance: number
): Array<{ x: number; y: number }> {
  if (points.length <= 3) return points;

  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [first!, last!];
}

function perpendicularDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
