import { BOUNCE_GATHER_GLSL } from './cascadeShaders';
import { GLSL_VERSION, SRGB_GLSL, TRACE_GLSL, fieldGlsl } from './glsl';
import { WALL_PUSH_GLSL } from './wallPushGlsl';

/**
 * The lighting layer's final pass. uTexture is the layer itself (red = in sight, green =
 * darkvision); uBackTexture the scene beneath (map and tokens, sRGB). World textures are read
 * through uScreenToWorld, so every render (GM or player camera) lights its own view;
 * uPixelWorld is the size of a screen pixel in world pixels.
 * uAreaOrigin is where the filter's area starts on screen (PIXI's uOutputFrame holds it only
 * for the last filter of a chain; `AreaAwareFilter` computes it for any position in one).
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
uniform float uPixelWorld;
uniform float uCore;
uniform float uBand;
uniform float uTexel;
uniform vec2 uLightWorld;
uniform vec2 uMapSize;
uniform vec3 uAmbient;
uniform float uExposure;
uniform float uBounceGain;
uniform float uPurkinje;
uniform float uMode;
uniform float uAllSeen;
${fieldGlsl('uField')}
float clearance(vec2 w) { return uFieldClearance(w); }
${TRACE_GLSL}
${WALL_PUSH_GLSL}
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

// Explored memory is stamped with hard-edged polygons: blur it over a disc of two memory texels,
// shrunk to the pixel's wall clearance so memory never smears across a wall. 12 Vogel taps,
// Gaussian in distance.
float exploredAt(vec2 w) {
  // The memory's scale is set by the map's longer side, whose texel count rounds least.
  vec2 size = vec2(textureSize(uExplored, 0));
  float texel = size.x >= size.y ? uMapSize.x / size.x : uMapSize.y / size.y;
  float r = min(2.0 * texel, clearance(w));
  float sum = texture(uExplored, clamp(w / uMapSize, 0.0, 1.0)).r;
  if (r < 0.25 * texel) return sum;
  float weights = 1.0;
  for (int i = 0; i < 12; i++) {
    float t = sqrt((float(i) + 0.5) / 12.0);
    float a = float(i) * 2.39996323;
    float k = exp(-2.0 * t * t);
    sum += k * texture(uExplored, clamp((w + vec2(cos(a), sin(a)) * t * r) / uMapSize, 0.0, 1.0)).r;
    weights += k;
  }
  return sum / weights;
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
  vec3 bounce = bounceAt(world);
  // Tiles end at the capsule: from its core to the band a wall's face takes the light (direct
  // and bounce alike) of the floor in front of it, on its own side, then blends back to its own
  // over a texel, where its own is fully lit (blending earlier left a dark line along walls).
  float d = wallDistance(world);
  float front = clamp((d - uCore) / uPixelWorld + 0.5, 0.0, 1.0) * (1.0 - smoothstep(uBand, uBand + uTexel, d));
  if (front > 0.0) {
    vec2 floorAt = climbFromWall(world, uBand);
    direct = mix(direct, texture(uLightMap, floorAt / uLightWorld).rgb, front);
    bounce = mix(bounce, bounceAt(floorAt), front);
  }
  vec4 sight = texture(uTexture, vTextureCoord);
  float seen = max(uAllSeen, sight.r);
  vec3 light = uAmbient + (direct + bounce * uBounceGain) * uExposure;
  vec3 lit = neutral(albedo * light);
  float night = (1.0 - smoothstep(0.03, 0.35, dot(light, LUMA))) * uPurkinje;
  lit = mix(lit, vec3(dot(lit, LUMA)) * vec3(0.86, 0.96, 1.18), night);

  float grey = dot(albedo, LUMA);
  vec3 darkSight = mix(vec3(grey), albedo, 0.15) * 0.15;
  vec3 visible = mix(lit, brighter(lit, darkSight), sight.g);
  float explored = uMode > 0.5 && seen < 1.0 ? exploredAt(world) : 0.0;
  vec3 player = mix(vec3(grey) * 0.07 * explored, visible, seen);

  // The GM always sees the map: a dim floor screen-blended under the light, unseen areas dimmer.
  vec3 floorColor = albedo * 0.05;
  vec3 gm = mix((1.0 - (1.0 - lit) * (1.0 - floorColor)) * 0.58, 1.0 - (1.0 - visible) * (1.0 - floorColor), seen);

  vec3 color = uMode > 0.5 ? player : gm;
  float dither = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0;
  finalColor = vec4(toSrgb(max(color, 0.0)) + dither, 1.0);
}`;
