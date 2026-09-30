import { chordOffsets } from '../../../lighting/chordOffsets';
import { TILE_RAYS } from '../../../lighting/lightingConstants';
import { GLSL_VERSION, MAX_STEPS, TRACE_GLSL, fieldGlsl } from './glsl';

const offsets = chordOffsets(TILE_RAYS).map((x) => x.toFixed(8)).join(', ');

/**
 * A tile pass covers the corner `uExtent` (0..1) of its target, so passes can draw into scratch
 * targets larger than the tile; `vUv` spans the tile and `gl_FragCoord` is its texel index.
 */
export const tileVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec2 uExtent;
out vec2 vUv;
void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition * uExtent * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The walls one light's tile is traced through: two-way walls and, when `uHasOneWay` is set,
 * the one-way walls that block from its side.
 */
export const TILE_CLEARANCE_GLSL = `
uniform float uHasOneWay;
${fieldGlsl('uField')}
${fieldGlsl('uOneWay')}
float clearance(vec2 w) {
  float c = uFieldClearance(w);
  return uHasOneWay > 0.5 ? min(c, uOneWayClearance(w)) : c;
}`;

/**
 * Share of the flame each texel sees. Leak-proof by construction: a texel is lit only through
 * straight paths that sphere tracing proved clear of every capsule. The cone test proves the
 * whole cone to the flame clear (each ball of clearance covers the widening cone up to the next
 * step); otherwise TILE_RAYS rays to equal-area strips of the flame, jittered within their strip.
 * This is the raw tile: `tileSmoothFragment` smooths it and fades it into the walls.
 */
export const tileFragment = `${GLSL_VERSION}
in vec2 vUv;
uniform vec4 uTileRect;
uniform vec2 uLight;
uniform float uFlame;
out vec4 finalColor;
${TILE_CLEARANCE_GLSL}
${TRACE_GLSL}
const float OFFSETS[${TILE_RAYS}] = float[${TILE_RAYS}](${offsets});

bool coneClear(vec2 p) {
  vec2 d = uLight - p;
  float len = length(d);
  if (len < 1e-3) return true;
  vec2 dir = d / len;
  float grow = uFlame / len;
  float s = 0.0;
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    float c = clearance(p + dir * s);
    float w = grow * s;
    if (c - w < 0.05) return false;
    float step = (c - w) / (1.0 + grow);
    if (s + step >= len) return true;
    s += step;
  }
  return false;
}

void main() {
  vec2 p = uTileRect.xy + vUv * uTileRect.zw;
  float vis = 0.0;
  if (clearance(p) > 0.0) {
    if (coneClear(p)) vis = 1.0;
    else {
      vec2 dir = normalize(uLight - p + vec2(1e-6));
      vec2 across = vec2(-dir.y, dir.x) * uFlame;
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
      float hit = 0.0;
      for (int k = 0; k < ${TILE_RAYS}; k++) {
        float lo = k > 0 ? OFFSETS[k - 1] : -1.0;
        float hi = k + 1 < ${TILE_RAYS} ? OFFSETS[k + 1] : 1.0;
        float x = OFFSETS[k] + jitter * (jitter < 0.0 ? OFFSETS[k] - lo : hi - OFFSETS[k]);
        if (reaches(p, uLight + across * x)) hit += 1.0;
      }
      vis = hit / ${TILE_RAYS.toFixed(1)};
    }
  }
  finalColor = vec4(vis, 0.0, 0.0, 1.0);
}`;
