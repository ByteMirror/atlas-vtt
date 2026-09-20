/**
 * Vector-based hit-testing for fog operations.
 *
 * Pure geometric math — no canvas reads, no resolution dependency.
 * Tests whether a world-space point falls on visible fog by checking
 * paint shapes minus erase shapes.
 */
import type { FogBrushStroke, FogLassoFill, FogOperation, FogRectangleFill } from '../../types/fogTypes';

/** Squared distance from point P to the nearest point on segment AB. */
function sqDistToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return ex * ex + ey * ey;
}

/** Point inside a brush stroke (thick polyline)? */
function pointInBrush(x: number, y: number, op: FogBrushStroke): boolean {
  const ox = op.offsetX ?? 0;
  const oy = op.offsetY ?? 0;
  const rSq = op.brushRadius * op.brushRadius;
  const pts = op.points;

  if (pts.length === 0) return false;

  if (pts.length === 1) {
    const dx = x - (pts[0]!.x + ox);
    const dy = y - (pts[0]!.y + oy);
    return dx * dx + dy * dy <= rSq;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const dist = sqDistToSegment(
      x, y,
      pts[i]!.x + ox, pts[i]!.y + oy,
      pts[i + 1]!.x + ox, pts[i + 1]!.y + oy,
    );
    if (dist <= rSq) return true;
  }

  return false;
}

/** Point inside a polygon (ray-casting)? */
function pointInPolygon(x: number, y: number, pts: Array<{ x: number; y: number }>, ox: number, oy: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]!.x + ox;
    const yi = pts[i]!.y + oy;
    const xj = pts[j]!.x + ox;
    const yj = pts[j]!.y + oy;

    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Point inside a lasso fill (polygon)? */
function pointInLasso(x: number, y: number, op: FogLassoFill): boolean {
  if (op.points.length < 3) return false;
  return pointInPolygon(x, y, op.points, op.offsetX ?? 0, op.offsetY ?? 0);
}

/** Point inside a rectangle fill? */
function pointInRectangle(x: number, y: number, op: FogRectangleFill): boolean {
  const ox = op.offsetX ?? 0;
  const oy = op.offsetY ?? 0;
  return x >= op.x + ox && x <= op.x + op.width + ox &&
         y >= op.y + oy && y <= op.y + op.height + oy;
}

/** Point inside any fog operation shape (ignoring isErasing flag)? */
function pointInShape(x: number, y: number, op: FogOperation): boolean {
  switch (op.type) {
    case 'brush': return pointInBrush(x, y, op);
    case 'lasso': return pointInLasso(x, y, op);
    case 'rectangle': return pointInRectangle(x, y, op);
    default: return false;
  }
}

/**
 * Test whether a world-space point hits a visible (non-erased) pixel
 * of the given paint operation.
 *
 * Returns true if the point is inside the paint shape AND not covered
 * by any erase operation that applies to it (timestamp > paint timestamp).
 */
export function hitTestFogOp(
  x: number,
  y: number,
  paintOp: FogOperation,
  allOps: FogOperation[],
): boolean {
  if (paintOp.isErasing) return false;
  if (!pointInShape(x, y, paintOp)) return false;

  // Check if any erase op covers this point
  for (const op of allOps) {
    if (!op.isErasing) continue;
    if (op.timestamp <= paintOp.timestamp) continue;
    if (pointInShape(x, y, op)) return false;
  }

  return true;
}


/**
 * Find all paint operations that are part of the same visual fog region
 * as `startId` via transitive geometric overlap (BFS flood-fill).
 *
 * Two paint ops are "connected" if their shapes overlap (ignoring erases).
 * Uses bounding-box pre-filter + point sampling for actual shape overlap.
 */
export function findConnectedFogOps(
  startId: string,
  paintOps: FogOperation[],
  allOps?: FogOperation[],
): string[] {
  if (paintOps.length <= 1) return [startId];
  const visibilityOps = allOps ?? paintOps;

  const boundsMap = new Map<string, { x: number; y: number; w: number; h: number }>();
  const opMap = new Map<string, FogOperation>();
  for (const op of paintOps) {
    opMap.set(op.id, op);
    boundsMap.set(op.id, opBounds(op));
  }

  const group = new Set<string>([startId]);
  const queue = [startId];

  while (queue.length > 0) {
    const curId = queue.shift()!;
    const curOp = opMap.get(curId)!;
    const curB = boundsMap.get(curId)!;

    for (const candidate of paintOps) {
      if (group.has(candidate.id)) continue;
      const candB = boundsMap.get(candidate.id)!;

      // Fast reject: bounding boxes don't overlap
      if (curB.x > candB.x + candB.w || curB.x + curB.w < candB.x ||
          curB.y > candB.y + candB.h || curB.y + curB.h < candB.y) continue;

      if (shapesOverlap(curOp, candidate, curB, candB, visibilityOps)) {
        group.add(candidate.id);
        queue.push(candidate.id);
      }
    }
  }

  return Array.from(group);
}

// ── Helpers for connected-component detection ────────────────────────

/** Lightweight bounding box for a fog operation. */
function opBounds(op: FogOperation): { x: number; y: number; w: number; h: number } {
  const ox = op.offsetX ?? 0;
  const oy = op.offsetY ?? 0;

  switch (op.type) {
    case 'brush': {
      const pts = op.points;
      if (!pts || pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x - op.brushRadius);
        minY = Math.min(minY, p.y - op.brushRadius);
        maxX = Math.max(maxX, p.x + op.brushRadius);
        maxY = Math.max(maxY, p.y + op.brushRadius);
      }
      return { x: minX + ox, y: minY + oy, w: maxX - minX, h: maxY - minY };
    }
    case 'lasso': {
      const pts = op.points;
      if (!pts || pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { x: minX + ox, y: minY + oy, w: maxX - minX, h: maxY - minY };
    }
    case 'rectangle':
      return { x: (op.x ?? 0) + ox, y: (op.y ?? 0) + oy, w: op.width ?? 0, h: op.height ?? 0 };
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

/** Extract representative sample points from a fog operation's geometry. */
function samplePoints(op: FogOperation): Array<{ x: number; y: number }> {
  const ox = op.offsetX ?? 0;
  const oy = op.offsetY ?? 0;

  switch (op.type) {
    case 'brush':
      return op.points.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    case 'lasso':
      return op.points.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    case 'rectangle': {
      const rx = (op.x ?? 0) + ox;
      const ry = (op.y ?? 0) + oy;
      const rw = op.width ?? 0;
      const rh = op.height ?? 0;
      return [
        { x: rx, y: ry }, { x: rx + rw, y: ry },
        { x: rx, y: ry + rh }, { x: rx + rw, y: ry + rh },
        { x: rx + rw / 2, y: ry + rh / 2 },
      ];
    }
    default:
      return [];
  }
}

/**
 * Check if two fog op shapes actually overlap geometrically.
 * Uses sample-point testing first, then a grid sweep through the
 * bounding-box intersection for edge-only overlaps.
 */
function shapesOverlap(
  a: FogOperation, b: FogOperation,
  ab: { x: number; y: number; w: number; h: number },
  bb: { x: number; y: number; w: number; h: number },
  allOps: FogOperation[],
): boolean {
  // Check sample points from A visible in both operations.
  for (const p of samplePoints(a)) {
    if (hitTestFogOp(p.x, p.y, a, allOps) && hitTestFogOp(p.x, p.y, b, allOps)) return true;
  }
  // Check sample points from B visible in both operations.
  for (const p of samplePoints(b)) {
    if (hitTestFogOp(p.x, p.y, b, allOps) && hitTestFogOp(p.x, p.y, a, allOps)) return true;
  }

  // Grid sweep through bounding-box intersection (catches edge-only overlaps)
  const ix = Math.max(ab.x, bb.x);
  const iy = Math.max(ab.y, bb.y);
  const iw = Math.min(ab.x + ab.w, bb.x + bb.w) - ix;
  const ih = Math.min(ab.y + ab.h, bb.y + bb.h) - iy;
  if (iw <= 0 || ih <= 0) return false;

  const step = Math.max(10, Math.min(iw, ih) / 5);
  for (let x = ix; x <= ix + iw; x += step) {
    for (let y = iy; y <= iy + ih; y += step) {
      if (hitTestFogOp(x, y, a, allOps) && hitTestFogOp(x, y, b, allOps)) return true;
    }
  }

  return false;
}
