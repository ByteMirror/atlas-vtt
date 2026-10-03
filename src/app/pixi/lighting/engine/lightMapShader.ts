import { BEAM_EDGE, BEAM_EDGE_TEXELS } from '../../../lighting/lightingConstants';
import { GLSL_VERSION } from './glsl';

export const lightMapVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec4 uRect;
uniform vec2 uMapWorld;
out vec2 vWorld;
void main() {
  vWorld = uRect.xy + aPosition * uRect.zw;
  gl_Position = vec4(vWorld / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

// A light shows its two ranges: the bright level up to the bright radius, the dim level from
// there to the dim radius, a fade to exactly zero at the reach. The step between the levels is a
// soft knee, 1 / (1 + (d / bright)^4): half way down at the bright radius, without an edge a
// flicker could move. The fade starts at the dim radius and is a smootherstep, level in slope and
// curvature at both ends. A Gaussian halo around the flame adds to the levels before the fade
// and the tile, so it cannot pass a wall; a light without a bright radius sizes it by a quarter
// of its reach. Radii are floored at 1 px so an empty light stays finite in the float target.
// The tile is read with texelFetch: its rect sits on this map's texel grid, so a texel here is a
// texel there.
// Alpha holds the luminance the light would have here at its bright level (never less than it
// has): the composite tonemaps a light at that level and scales the result back, so a floor
// shows the dim range at the same share of the bright range whatever its colour.
// A light that shines one way (`uCone`: its facing as a unit vector, half its angle, the radius
// of its own space; half an angle of π or more is no cone) keeps all of this inside its cone and
// within its own space. Past the cone's sides it falls off over its edge (steeply: what lies
// there is lit and not counted): `uEdge` world pixels, or `BEAM_EDGE` of the beam's half-width
// at that distance where that is less, though never under a texel (`beamEdge`). Past its own space it falls off over the
// edge it has at that radius. The tile knows nothing of the cone, so turning a light traces nothing.
// The colour is `uLightColor`: PIXI sets `uColor` itself, as a vec4, on every mesh shader that declares it.
export const lightMapFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec4 uRect;
uniform vec2 uLight;
uniform float uBright;
uniform float uDim;
uniform float uReach;
uniform float uIntensity;
uniform vec3 uLightColor;
uniform float uBrightLevel;
uniform float uDimLevel;
uniform float uHaloGain;
uniform float uHaloSize;
uniform float uTexel;
uniform vec4 uCone;
uniform float uEdge;
uniform sampler2D uTile;
out vec4 finalColor;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
float smoother(float u) { return u * u * u * (u * (u * 6.0 - 15.0) + 10.0); }
// The width of the beam's soft edge at d from the light (beamEdge).
float edgeAt(float d) {
  return max(min(uEdge, max(${BEAM_EDGE_TEXELS.toFixed(2)} * uTexel, ${BEAM_EDGE.toFixed(4)} * d * sin(min(uCone.z, 3.14159265 - uCone.z)))), 1e-3);
}
// The share of the light a point at v from the light gets by where the light faces.
float inCone(vec2 v, float d) {
  float off = acos(clamp(dot(v, uCone.xy) / max(d, 1e-4), -1.0, 1.0)) - uCone.z;
  // How far past the cone's nearer edge: across it in front of the light, from the light itself behind it.
  float across = off < 1.5708 ? d * sin(max(off, 0.0)) : d;
  float left = 1.0 - clamp(across / edgeAt(d), 0.0, 1.0);
  float beam = left * left;
  float own = 1.0 - smoother(clamp((d - uCone.w) / edgeAt(uCone.w), 0.0, 1.0));
  return max(beam, own);
}
void main() {
  ivec2 texel = ivec2(floor((vWorld - uRect.xy) / uTexel));
  ivec2 size = textureSize(uTile, 0);
  if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, size))) discard;
  float d = distance(vWorld, uLight);
  float reach = max(uReach, 1.0);
  float t = d / max(uBright, 1.0);
  float t2 = t * t;
  float e = mix(uDimLevel, uBrightLevel, 1.0 / (1.0 + t2 * t2));
  float s = max(max(uBright, reach * 0.25) * uHaloSize, 1.0);
  e += uHaloGain * exp(-(d * d) / (2.0 * s * s));
  float atBright = max(1.0, uBrightLevel / max(e, 1e-4));
  float u = clamp((reach - d) / max(reach - uDim, 1e-3), 0.0, 1.0);
  float fade = u * u * u * (u * (u * 6.0 - 15.0) + 10.0);
  vec3 light = uLightColor * (uIntensity * e * fade * texelFetch(uTile, texel, 0).r);
  if (uCone.z < 3.14159) light *= inCone(vWorld - uLight, d);
  finalColor = vec4(light, dot(light, LUMA) * atBright);
}`;
