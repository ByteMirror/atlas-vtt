import { Filter, GlProgram, Shader, UniformGroup, defaultFilterVert } from 'pixi.js';

/**
 * Light is written at this scale so overlapping lights keep headroom in 8-bit layers:
 * the composite divides it back out, so values up to 1 / LIGHT_ENCODING survive.
 */
export const LIGHT_ENCODING = 0.5;

/** One light's parameters for a frame, in world pixels. */
export interface LightFrame {
  x: number;
  y: number;
  bright: number;
  dim: number;
  /** Radius of the flame; the width of the penumbra grows with it. */
  sourceRadius: number;
  /** Linear RGB, 0–1. */
  color: [number, number, number];
  intensity: number;
}

/** Uniforms shared by a light's falloff quad and its shadow quads. */
export interface LightUniforms {
  group: UniformGroup;
  set(frame: LightFrame): void;
}

/** How far the light's glow runs past its dim radius before it reaches zero. */
export const LIGHT_EDGE = 1.12;

const PROJECT = `
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

vec4 project(vec2 world) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  return vec4((mvp * vec3(world, 1.0)).xy, 0.0, 1.0);
}`;

const LIGHT_UNIFORMS = `
uniform vec4 uLight;   // x, y, dim radius, source radius
uniform float uBright;
uniform vec3 uColor;
uniform float uIntensity;`;

// The quad is a unit square scaled to the glow's reach around the light, so a moving
// light only changes uniforms.
const lightVertex = `
in vec2 aPosition;
out vec2 vWorld;
${LIGHT_UNIFORMS}
${PROJECT}

void main() {
  vWorld = uLight.xy + aPosition * uLight.z * ${LIGHT_EDGE.toFixed(2)};
  gl_Position = project(vWorld);
}`;

// Full light inside the bright radius, a dim level that eases from 0.5 to 0.3 across the
// dim ring (it stays readable to the edge), then a short soft fade past the dim radius.
const lightFragment = `
in vec2 vWorld;
${LIGHT_UNIFORMS}

void main() {
  float d = length(vWorld - uLight.xy) / max(uLight.z, 1.0);
  float b = clamp(uBright / max(uLight.z, 1.0), 0.0, 0.98);
  float brightPart = 1.0 - smoothstep(b * 0.8, min(b * 1.2, 0.99), d);
  float dimLevel = mix(0.5, 0.3, clamp((d - b) / max(1.0 - b, 0.001), 0.0, 1.0));
  float edge = 1.0 - smoothstep(1.0, ${LIGHT_EDGE.toFixed(2)}, d);
  float core = 0.35 * exp(-d * d * 60.0);
  float f = (mix(dimLevel, 1.0, brightPart) + core) * edge * uIntensity;
  // Firelight looks whiter where it is strong and deepens in colour as it fades.
  vec3 tint = mix(vec3(1.0), uColor, mix(0.6, 0.45, brightPart));
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(max(tint * f * ${LIGHT_ENCODING.toFixed(2)} + dither, 0.0), 0.0);
}`;

// Each wall is a fan from its endpoints to far points pushed away from the light's
// opposite rim, plus one far point straight behind its middle, so the fan covers the umbra
// and the whole outer penumbra out past the light's reach.
const shadowVertex = `
in vec2 aPosition;
in vec4 aSegment;
in vec2 aCorner;
out vec2 vWorld;
out vec4 vSegment;
${LIGHT_UNIFORMS}
${PROJECT}

void main() {
  vec2 e = aPosition;
  vec2 far;
  if (abs(aCorner.x - 0.5) < 0.25) {
    vec2 away = e - uLight.xy;
    vec2 normal = normalize(vec2(aSegment.y - aSegment.w, aSegment.z - aSegment.x));
    far = length(away) > 0.001 ? normalize(away) : normal * sign(dot(normal, e - uLight.xy) + 0.5);
  } else {
    vec2 other = aCorner.x < 0.5 ? aSegment.zw : aSegment.xy;
    vec2 toE = e - uLight.xy;
    vec2 dir = length(toE) > 0.001 ? normalize(toE) : normalize(e - other);
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 outward = perp * (dot(perp, e - other) >= 0.0 ? 1.0 : -1.0);
    vec2 away = e - (uLight.xy - outward * uLight.w);
    far = length(away) > 0.001 ? normalize(away) : dir;
  }
  // Four times the dim radius: the fan's far edges then stay outside the glow (1.12 × dim).
  vWorld = aCorner.y < 0.5 ? e : e + far * uLight.z * 4.0;
  vSegment = aSegment;
  gl_Position = project(vWorld);
}`;

// Share of the light's disc the wall hides from this pixel: the disc and the wall are both
// projected onto the plane through the light, facing the pixel, and the overlap is weighed
// by the disc's chord lengths, so the penumbra fades like a real round flame.
const shadowFragment = `
in vec2 vWorld;
in vec4 vSegment;
${LIGHT_UNIFORMS}

float discShare(float x) {
  x = clamp(x, -1.0, 1.0);
  return 0.5 + (x * sqrt(1.0 - x * x) + asin(x)) / 3.14159265;
}

float project1d(vec2 end, vec2 dir, vec2 perp, float dist) {
  vec2 rel = end - vWorld;
  float depth = dot(rel, dir);
  float side = dot(rel, perp);
  return depth > 0.001 ? side * dist / depth : sign(side) * 1e6;
}

void main() {
  vec2 a = vSegment.xy;
  vec2 b = vSegment.zw;
  vec2 toLight = uLight.xy - vWorld;
  float dist = length(toLight);
  vec2 n = vec2(a.y - b.y, b.x - a.x);
  bool sameSide = sign(dot(vWorld - a, n)) == sign(dot(uLight.xy - a, n));
  if (dist < 0.001 || sameSide) discard;
  vec2 dir = toLight / dist;
  vec2 perp = vec2(-dir.y, dir.x);
  float sa = project1d(a, dir, perp, dist);
  float sb = project1d(b, dir, perp, dist);
  float r = max(uLight.w, 0.5);
  float occlusion = discShare(max(sa, sb) / r) - discShare(min(sa, sb) / r);
  gl_FragColor = vec4(0.0, 0.0, 0.0, occlusion);
}`;

// A light's own layer holds its colour in rgb and the summed occlusion of its walls in
// alpha; this pass hands the shaded light to the lighting layer, adding it to the rest.
const layerFragment = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;

void main() {
  vec4 layer = texture(uTexture, vTextureCoord);
  finalColor = vec4(layer.rgb * (1.0 - clamp(layer.a, 0.0, 1.0)), 0.0);
}`;

export function createLightUniforms(): LightUniforms {
  const group = new UniformGroup({
    uLight: { value: new Float32Array(4), type: 'vec4<f32>' },
    uBright: { value: 0, type: 'f32' },
    uColor: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
    uIntensity: { value: 1, type: 'f32' },
  });
  const { uniforms } = group;
  return {
    group,
    set(frame): void {
      uniforms.uLight.set([frame.x, frame.y, frame.dim, frame.sourceRadius]);
      uniforms.uBright = frame.bright;
      uniforms.uColor.set(frame.color);
      uniforms.uIntensity = frame.intensity;
      group.update();
    },
  };
}

/** The light's falloff quad. Atlas renders with WebGL only, so this ships GLSL alone. */
export function createLightShader(uniforms: LightUniforms): Shader {
  return Shader.from({ gl: { vertex: lightVertex, fragment: lightFragment, name: 'atlas-light', preferredFragmentPrecision: 'highp' }, resources: { lightUniforms: uniforms.group } });
}

export function createShadowShader(uniforms: LightUniforms): Shader {
  return Shader.from({ gl: { vertex: shadowVertex, fragment: shadowFragment, name: 'atlas-light-shadow', preferredFragmentPrecision: 'highp' }, resources: { lightUniforms: uniforms.group } });
}

export function createLightLayerFilter(): Filter {
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: layerFragment, name: 'atlas-light-layer', preferredFragmentPrecision: 'highp' }),
    resources: {},
    resolution: 'inherit',
  });
  filter.blendMode = 'add';
  return filter;
}
