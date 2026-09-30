/**
 * PIXI compiles a shader as GLSL ES 1.00 unless its source starts with this line; `texture()`,
 * `flat` and the other WebGL2 features the engine uses need ES 3.00, so every engine shader starts with it.
 * ES 3.00 defaults `sampler2D` to lowp and PIXI only adds a float precision, so the line also lifts
 * samplers to highp: every lighting texture is read at full precision.
 */
export const GLSL_VERSION = '#version 300 es\nprecision highp sampler2D;\n';

/** Steps a sphere trace may take; running out counts as blocked. */
export const MAX_STEPS = 256;

/**
 * A capsule field sampled conservatively: the stored distance minus the interpolation margin
 * (`Params.x`), shrunk by how far `w` lies outside the field; `Clearance` also subtracts the
 * wall radius (`Params.y`), so it is the distance to the nearest capsule's surface.
 */
export function fieldGlsl(name: string): string {
  return `
uniform sampler2D ${name};
uniform vec4 ${name}Rect;
uniform vec2 ${name}Params;
float ${name}Distance(vec2 w) {
  vec2 lo = ${name}Rect.xy;
  vec2 inside = clamp(w, lo, lo + ${name}Rect.zw);
  return texture(${name}, (inside - lo) / ${name}Rect.zw).r - length(w - inside) - ${name}Params.x;
}
float ${name}Clearance(vec2 w) { return ${name}Distance(w) - ${name}Params.y; }`;
}

/**
 * Whether the straight path from p to t stays outside every wall. Steps never exceed the
 * conservative clearance, so no wall can be jumped; out of steps counts as blocked.
 * Requires `float clearance(vec2)`.
 */
export const TRACE_GLSL = `
bool reaches(vec2 p, vec2 t) {
  vec2 d = t - p;
  float len = length(d);
  if (len < 1e-3) return true;
  vec2 dir = d / len;
  float s = 0.0;
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    float c = clearance(p + dir * s);
    if (c < 0.02) return false;
    if (len - s <= c) return true;
    s += c;
  }
  return false;
}`;

/** Full-target pass: `aPosition` 0..1 covers the target, `vUv` is the texel centre. */
export const FULLSCREEN_VERTEX = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SRGB_GLSL = `
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }`;

/** Share of a unit disc left of x (-1..1). */
export const DISC_SHARE_GLSL = `
float discShare(float x) {
  x = clamp(x, -1.0, 1.0);
  return 0.5 + (x * sqrt(1.0 - x * x) + asin(x)) / 3.14159265;
}`;
