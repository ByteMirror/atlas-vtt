import type { Point, VisionPolygon, VisionSource } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { angleTo, raySegmentIntersect, distSq, clipPolygonToCircle, isOnBlockingSide } from './visionGeometry';

interface WallRef {
  p1: Point;
  p2: Point;
}

/**
 * Compute the visibility polygon for a single vision source
 * using a radial sweep algorithm.
 */
export function computeVisibilityPolygon(
  source: VisionSource,
  walls: WallSegment[],
): VisionPolygon {
  const maxRadius = source.outerRadius;
  const maxRadiusSq = maxRadius * maxRadius;
  const origin: Point = { x: source.x, y: source.y };

  // 1. Radius cull and filter by wall type
  const relevantWalls: WallRef[] = [];
  for (const wall of walls) {
    // Skip open doors
    if ((wall.type === 'door' || wall.type === 'secret-door') && !(wall.closed ?? true)) {
      continue;
    }
    // Skip walls with a direction if the source is on the pass-through side
    if (wall.direction) {
      if (!isOnBlockingSide(origin, wall.p1, wall.p2, wall.direction)) {
        continue;
      }
    }
    // Radius cull
    const d1Sq = distSq(origin, wall.p1);
    const d2Sq = distSq(origin, wall.p2);
    if (d1Sq <= maxRadiusSq || d2Sq <= maxRadiusSq) {
      relevantWalls.push({ p1: wall.p1, p2: wall.p2 });
      continue;
    }
    // Check closest point on segment
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq > 0) {
      const t = Math.max(0, Math.min(1,
        ((origin.x - wall.p1.x) * dx + (origin.y - wall.p1.y) * dy) / lenSq
      ));
      const closest = { x: wall.p1.x + t * dx, y: wall.p1.y + t * dy };
      if (distSq(origin, closest) <= maxRadiusSq) {
        relevantWalls.push({ p1: wall.p1, p2: wall.p2 });
      }
    }
  }

  // 2. Collect unique endpoints
  const endpointSet = new Map<string, Point>();
  for (const wall of relevantWalls) {
    const k1 = `${Math.round(wall.p1.x * 10)},${Math.round(wall.p1.y * 10)}`;
    const k2 = `${Math.round(wall.p2.x * 10)},${Math.round(wall.p2.y * 10)}`;
    endpointSet.set(k1, wall.p1);
    endpointSet.set(k2, wall.p2);
  }
  const endpoints = Array.from(endpointSet.values());

  // If no walls, return full circle
  if (endpoints.length === 0) {
    return createCirclePolygon(source, origin);
  }

  // 3. Cast rays at angle ± tiny offset per endpoint,
  // plus boundary rays around the full circle to ensure complete coverage.
  // Without boundary rays the polygon has a straight-line gap between the
  // last and first endpoint angles instead of following the maxRadius arc.
  const OFFSET = 1e-5;
  const angles: number[] = [];
  for (const ep of endpoints) {
    const angle = angleTo(origin, ep);
    angles.push(angle - OFFSET, angle, angle + OFFSET);
  }
  // Add evenly-spaced boundary rays so the polygon traces the radius arc
  const BOUNDARY_COUNT = 64;
  for (let i = 0; i < BOUNDARY_COUNT; i++) {
    angles.push(-Math.PI + (2 * Math.PI * i) / BOUNDARY_COUNT);
  }
  angles.sort((a, b) => a - b);

  // 4. For each angle, find nearest wall intersection
  const vertices: Point[] = [];
  for (const angle of angles) {
    let minT = maxRadius;

    for (const wall of relevantWalls) {
      const t = raySegmentIntersect(origin, angle, wall.p1, wall.p2);
      if (t < minT) {
        minT = t;
      }
    }

    vertices.push({
      x: origin.x + Math.cos(angle) * minT,
      y: origin.y + Math.sin(angle) * minT,
    });
  }

  // 5. Clip to outer radius circle
  const clipped = clipPolygonToCircle(vertices, origin, maxRadius);

  return {
    sourceId: source.id,
    vertices: clipped.length >= 3 ? clipped : vertices,
    innerRadius: source.innerRadius,
    outerRadius: source.outerRadius,
    intensity: 1,
    origin,
  };
}

/** Generate a circle polygon for sources with no occluding walls. */
function createCirclePolygon(source: VisionSource, origin: Point): VisionPolygon {
  const SEGMENTS = 64;
  const vertices: Point[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (2 * Math.PI * i) / SEGMENTS;
    vertices.push({
      x: origin.x + Math.cos(angle) * source.outerRadius,
      y: origin.y + Math.sin(angle) * source.outerRadius,
    });
  }
  return {
    sourceId: source.id,
    vertices,
    innerRadius: source.innerRadius,
    outerRadius: source.outerRadius,
    intensity: 1,
    origin,
  };
}
