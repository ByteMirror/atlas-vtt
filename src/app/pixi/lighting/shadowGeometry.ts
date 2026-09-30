import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { wallsInReach } from '../../vision/visibility';

/** Vertex data for one light's shadow quads, laid out for `lightShaders`' shadow program. */
export interface ShadowBuffers {
  /** Each vertex's wall endpoint; the shader extrudes far corners itself. */
  positions: Float32Array;
  /** The caster's endpoints (ax, ay, bx, by), repeated on its four vertices. */
  segments: Float32Array;
  /** (endpoint, far): endpoint 0 = a, 1 = b, 0.5 = the middle; far 0 = on the wall, 1 = pushed away from the light. */
  corners: Float32Array;
  indices: Uint32Array;
  count: number;
}

// Both endpoints, their far corners, and a far point behind the middle of the wall. The
// middle point keeps each half of the fan under 90° wide, so its far edges stay beyond the
// light's reach even when the light nearly touches the wall and the shadow spans ~180°.
const CORNERS = [0, 0, 1, 0, 0, 1, 1, 1, 0.5, 1];
const FAN_INDICES = [0, 1, 4, 0, 4, 2, 1, 3, 4];
const VERTICES = 5;

/** Walls that throw a shadow from a light at `origin` reaching `reach` world pixels. */
export function shadowCasters(walls: readonly WallSegment[], origin: Point, reach: number): WallSegment[] {
  return wallsInReach(walls, origin, reach);
}

export function buildShadowQuads(casters: readonly WallSegment[]): ShadowBuffers {
  const count = casters.length;
  const positions = new Float32Array(count * VERTICES * 2);
  const segments = new Float32Array(count * VERTICES * 4);
  const corners = new Float32Array(count * VERTICES * 2);
  const indices = new Uint32Array(count * FAN_INDICES.length);
  casters.forEach((wall, i) => {
    for (let v = 0; v < VERTICES; v++) {
      const t = CORNERS[v * 2]!;
      const point = { x: wall.p1.x + (wall.p2.x - wall.p1.x) * t, y: wall.p1.y + (wall.p2.y - wall.p1.y) * t };
      positions.set([point.x, point.y], (i * VERTICES + v) * 2);
      segments.set([wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y], (i * VERTICES + v) * 4);
    }
    corners.set(CORNERS, i * VERTICES * 2);
    indices.set(FAN_INDICES.map((index) => index + i * VERTICES), i * FAN_INDICES.length);
  });
  return { positions, segments, corners, indices, count };
}
