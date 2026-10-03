import { GLSL_VERSION } from './glsl';

export const capsuleFieldVertex = `${GLSL_VERSION}
in vec2 aPosition;
in vec4 aSegment;
uniform vec4 uBuildRect;
uniform float uMax;
out vec2 vWorld;
flat out vec4 vSegment;
void main() {
  vec2 lo = min(aSegment.xy, aSegment.zw) - uMax;
  vec2 hi = max(aSegment.xy, aSegment.zw) + uMax;
  vWorld = mix(lo, hi, aPosition);
  vSegment = aSegment;
  gl_Position = vec4((vWorld - uBuildRect.xy) / uBuildRect.zw * 2.0 - 1.0, 0.0, 1.0);
}`;

export const capsuleFieldFragment = `${GLSL_VERSION}
in vec2 vWorld;
flat in vec4 vSegment;
uniform float uMax;
out vec4 finalColor;
void main() {
  vec2 ab = vSegment.zw - vSegment.xy;
  vec2 ap = vWorld - vSegment.xy;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  finalColor = vec4(min(length(ap - ab * t), uMax), 0.0, 0.0, 1.0);
}`;
