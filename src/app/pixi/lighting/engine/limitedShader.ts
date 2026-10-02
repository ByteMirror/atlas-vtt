import { GLSL_VERSION } from './glsl';

/** Quads in pixels from the tile's first corner; each carries the reach across a limited wall it reads over (none for the quad that copies the tile). */
export const limitedVertex = `${GLSL_VERSION}
in vec2 aPosition;
in vec2 aAcross;
uniform vec2 uMapWorld;
flat out vec2 vAcross;
void main() {
  vAcross = aAcross;
  gl_Position = vec4(aPosition / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

// A tile around a limited wall: the darkest of the tile here and at three steps to either side
// of the wall, up to \`vAcross\` away. Where the wall stopped the light its far side is dark, so
// its near side goes dark as far as a capsule reaches; where the light passed it both sides are
// lit and nothing changes. Drawn with \`min\` blending over a copy of the tile (the same program
// with no reach), so walls that overlap each take what they find.
export const limitedFragment = `${GLSL_VERSION}
flat in vec2 vAcross;
uniform sampler2D uTile;
uniform float uTexel;
out vec4 finalColor;
float tileAt(vec2 offset) {
  ivec2 texel = clamp(ivec2(floor(gl_FragCoord.xy + offset / uTexel)), ivec2(0), textureSize(uTile, 0) - 1);
  return texelFetch(uTile, texel, 0).r;
}
void main() {
  float light = tileAt(vec2(0.0));
  for (int k = 1; k <= 3; k++) {
    vec2 offset = vAcross * (float(k) / 3.0);
    light = min(light, min(tileAt(offset), tileAt(-offset)));
  }
  finalColor = vec4(light, 0.0, 0.0, 1.0);
}`;
