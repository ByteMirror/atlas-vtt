import { REVEAL } from '../../../lighting/lightingConstants';
import { BOUNCE_GATHER_GLSL } from './cascadeShaders';
import { GLSL_VERSION, SRGB_GLSL, TRACE_GLSL, fieldGlsl } from './glsl';

/**
 * The lighting layer's final pass. uTexture is the layer itself (red = in sight, green =
 * darkvision); uBackTexture the scene beneath (map and tokens, sRGB). World textures are read
 * through uScreenToWorld, so every render (GM or player camera) lights its own view.
 * uAreaOrigin is where the filter's area starts on screen (PIXI's uOutputFrame holds it only
 * for the last filter of a chain, and bloom follows this one).
 */
export const compositeFragment = `${GLSL_VERSION}
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform sampler2D uLightMap;
uniform sampler2D uExplored;
uniform vec2 uAreaOrigin;
uniform mat3 uScreenToWorld;
uniform vec2 uLightWorld;
uniform vec2 uMapSize;
uniform vec3 uAmbient;
uniform float uExposure;
uniform float uBounceGain;
uniform float uPurkinje;
uniform float uMode;
uniform float uAllSeen;
uniform float uRevealPx;
${fieldGlsl('uField')}
float clearance(vec2 w) { return uFieldClearance(w); }
${TRACE_GLSL}
${BOUNCE_GATHER_GLSL}
${SRGB_GLSL}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Khronos PBR Neutral: colours stay as painted up to ~0.8, highlights roll off to white.
vec3 neutral(vec3 color) {
  const float start = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  const float d = 1.0 - start;
  float newPeak = 1.0 - d * d / (peak + d - start);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

// Sight stops at a wall's centre line; the drawn wall is revealed where a point ${REVEAL} px
// away (any of eight directions) is seen. Bounded to ${REVEAL} px past the centre line.
float revealed(float here, vec2 world) {
  if (here >= 1.0 || uFieldDistance(world) >= uFieldParams.y + ${REVEAL.toFixed(1)}) return here;
  vec2 step = uRevealPx / uInputSize.xy;
  float best = here;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.78539816;
    best = max(best, texture(uTexture, clamp(vTextureCoord + vec2(cos(a), sin(a)) * step, uInputClamp.xy, uInputClamp.zw)).r);
  }
  return best;
}

// Whichever colour is brighter, blended near a tie (a per-channel max mixes them into pink).
vec3 brighter(vec3 a, vec3 b) {
  return mix(a, b, smoothstep(-0.02, 0.02, dot(b - a, LUMA)));
}

void main() {
  vec2 screen = vTextureCoord * uInputSize.xy + uAreaOrigin;
  vec2 world = (uScreenToWorld * vec3(screen, 1.0)).xy;
  vec3 albedo = toLinear(texture(uBackTexture, vTextureCoord).rgb);
  vec3 direct = texture(uLightMap, world / uLightWorld).rgb;
  vec3 light = uAmbient + (direct + bounceAt(world) * uBounceGain) * uExposure;
  vec3 lit = neutral(albedo * light);
  float night = (1.0 - smoothstep(0.03, 0.35, dot(light, LUMA))) * uPurkinje;
  lit = mix(lit, vec3(dot(lit, LUMA)) * vec3(0.86, 0.96, 1.18), night);

  vec4 sight = texture(uTexture, vTextureCoord);
  float seen = max(uAllSeen, revealed(sight.r, world));
  float grey = dot(albedo, LUMA);
  vec3 darkSight = mix(vec3(grey), albedo, 0.15) * 0.15;
  vec3 visible = mix(lit, brighter(lit, darkSight), sight.g);
  float explored = texture(uExplored, clamp(world / uMapSize, 0.0, 1.0)).r;
  vec3 player = mix(vec3(grey) * 0.07 * explored, visible, seen);

  // The GM always sees the map: a dim floor screen-blended under the light, unseen areas dimmer.
  vec3 floorColor = albedo * 0.05;
  vec3 gm = mix((1.0 - (1.0 - lit) * (1.0 - floorColor)) * 0.58, 1.0 - (1.0 - visible) * (1.0 - floorColor), seen);

  vec3 color = uMode > 0.5 ? player : gm;
  float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  finalColor = vec4(toSrgb(max(color, 0.0)) + dither, 1.0);
}`;
