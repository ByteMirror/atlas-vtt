import type { Point } from '../types/visionTypes';
import type { Polygon } from './visibility';

/**
 * A sight shadow's soft edge: from wall corner `a`, along the shadow edge `e` (unit, away
 * from the viewer), opening by `phi` radians towards `side` (+1 = increasing angle), which
 * is always the side the viewer sees.
 */
export interface SightWedge {
  a: Point;
  e: Point;
  side: 1 | -1;
  phi: number;
}

/** Widest wedge, so a corner right next to the token does not grey out half the view. */
const MAX_PHI = 1.2;

/** Radial edges whose nearer end lies this close to the viewer are a vision cone's edges. */
const CONE_EDGE = 1;

/**
 * Radial polygon edges are sight shadows cast by a wall corner (the nearer end). The sweep
 * saw past the corner on the side of the far end, so that is where the wedge opens. A vision
 * cone's edges start at the viewer and stay hard.
 */
export function sightWedges(origin: Point, polygon: Polygon, radius: number): SightWedge[] {
  const wedges: SightWedge[] = [];
  const angle = polygon.map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));
  const dist = polygon.map((p) => Math.hypot(p.x - origin.x, p.y - origin.y));
  for (let i = 0; i + 1 < polygon.length; i++) {
    if (Math.abs(angle[i + 1]! - angle[i]!) > 1e-4 || Math.abs(dist[i + 1]! - dist[i]!) < 1) continue;
    // Only a vision cone's edge starts at the origin (a wall corner is never that close).
    if (Math.min(dist[i]!, dist[i + 1]!) < CONE_EDGE) continue;
    const nearFirst = dist[i]! < dist[i + 1]!;
    const a = polygon[nearFirst ? i : i + 1]!;
    const d = Math.max(dist[nearFirst ? i : i + 1]!, 1e-6);
    wedges.push({
      a,
      e: { x: (a.x - origin.x) / d, y: (a.y - origin.y) / d },
      side: nearFirst ? 1 : -1,
      phi: Math.min(Math.atan(radius / Math.max(d, 1)), MAX_PHI),
    });
  }
  return wedges;
}
