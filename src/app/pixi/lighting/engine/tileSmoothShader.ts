import { TILE_SMOOTH } from '../../../lighting/lightingConstants';
import { GLSL_VERSION } from './glsl';
import { TILE_CLEARANCE_GLSL } from './tileShader';

/** Texel offsets within `TILE_SMOOTH` of a texel (without itself), with their Gaussian weights (sigma = half the radius). */
function smoothTaps(): string {
  const sigma = TILE_SMOOTH / 2;
  const taps: string[] = [];
  for (let j = -TILE_SMOOTH; j <= TILE_SMOOTH; j++) {
    for (let i = -TILE_SMOOTH; i <= TILE_SMOOTH; i++) {
      const q = i * i + j * j;
      if (q === 0 || q >= TILE_SMOOTH * TILE_SMOOTH) continue;
      taps.push(`  tap(ivec2(${i}, ${j}), ${q.toFixed(1)}, ${Math.exp(-q / (2 * sigma * sigma)).toFixed(6)});`);
    }
  }
  return taps.join('\n');
}

/**
 * Smooths a raw tile (`uRaw`, same texel grid, the tile's `uTexels` in its corner) and fades it
 * into the walls. Each texel becomes a Gaussian-weighted average of the texels closer than its
 * clearance (and than `TILE_SMOOTH` texels): that disc holds no wall, so every texel read lies
 * in the same free region as this one and light spreads within free space, never across a wall.
 * Near walls the disc shrinks, keeping contact shadows crisp. The fade then follows the smooth
 * field rather than stopping at the binary hit, so capsule edges never show as texel steps;
 * texels without clearance stay exactly 0.
 */
export const tileSmoothFragment = `${GLSL_VERSION}
in vec2 vUv;
uniform vec4 uTileRect;
uniform float uTexel;
uniform vec2 uTexels;
uniform sampler2D uRaw;
out vec4 finalColor;
${TILE_CLEARANCE_GLSL}

ivec2 here;
ivec2 last;
float reach2;
float sum;
float weights;

void tap(ivec2 offset, float q, float weight) {
  float w = q < reach2 ? weight : 0.0;
  sum += w * texelFetch(uRaw, clamp(here + offset, ivec2(0), last), 0).r;
  weights += w;
}

void main() {
  here = ivec2(gl_FragCoord.xy);
  last = ivec2(uTexels) - 1;
  float c = clearance(uTileRect.xy + (vec2(here) + 0.5) * uTexel);
  float reach = c / uTexel;
  reach2 = reach * max(reach, 0.0);
  sum = texelFetch(uRaw, here, 0).r;
  weights = 1.0;
${smoothTaps()}
  finalColor = vec4(sum / weights * smoothstep(0.0, uTexel * 2.0, c), 0.0, 0.0, 1.0);
}`;
