import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { wallsInReach } from '../../vision/visibility';

/** Vertex data for one light's shadow quads, laid out for `lightShaders`' shadow program. */
export interface ShadowBuffers {
  /** Each vertex's wall endpoint; the shader extrudes far corners itself. */
  positions: Float32Array;
  /** The caster's endpoints (ax, ay, bx, by), repeated on its four vertices. */
  segments: Float32Array;
  /** (endpoint, far): endpoint 0 = a, 1 = b; far 0 = on the wall, 1 = pushed away from the light. */
  corners: Float32Array;
  indices: Uint32Array;
  count: number;
}

const CORNERS = [0, 0, 1, 0, 0, 1, 1, 1];
const QUAD_INDICES = [0, 1, 2, 1, 3, 2];

/** Walls that throw a shadow from a light at `origin` reaching `reach` world pixels. */
export function shadowCasters(walls: readonly WallSegment[], origin: Point, reach: number): WallSegment[] {
  return wallsInReach(walls, origin, reach);
}

export function buildShadowQuads(casters: readonly WallSegment[]): ShadowBuffers {
  const count = casters.length;
  const positions = new Float32Array(count * 8);
  const segments = new Float32Array(count * 16);
  const corners = new Float32Array(count * 8);
  const indices = new Uint32Array(count * 6);
  casters.forEach((wall, i) => {
    for (let v = 0; v < 4; v++) {
      const end = CORNERS[v * 2] === 0 ? wall.p1 : wall.p2;
      positions.set([end.x, end.y], (i * 4 + v) * 2);
      segments.set([wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y], (i * 4 + v) * 4);
    }
    corners.set(CORNERS, i * 8);
    indices.set(QUAD_INDICES.map((index) => index + i * 4), i * 6);
  });
  return { positions, segments, corners, indices, count };
}
