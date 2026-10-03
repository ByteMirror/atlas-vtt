import { GLSL_VERSION } from './glsl';

/** A darkness source's area: the polygon the rule counts as magically dark, in world pixels, drawn over the whole map target. */
export const darknessVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec2 uMapWorld;
out vec2 vWorld;
void main() {
  vWorld = aPosition;
  gl_Position = vec4(aPosition / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

// How much of the light a darkness source swallows: all of it inside the area the rule counts
// (the mesh is that polygon: the source's reach as walls cut it, lines without thickness, so a
// wall casts no shadow of its own into the darkness), fading to none over the last `uSoft` px
// before its radius, never beyond it. `uOut` picks what the coverage is written as: alpha, to
// erase the light map beneath it (`LightMap`), or red, the darkness map's own channel.
export const darknessFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec2 uLight;
uniform float uDim;
uniform float uSoft;
uniform vec4 uOut;
out vec4 finalColor;
void main() {
  float u = clamp((uDim - distance(vWorld, uLight)) / max(uSoft, 1e-3), 0.0, 1.0);
  finalColor = uOut * (u * u * (3.0 - 2.0 * u));
}`;

/** A polygon in world pixels, drawn over the whole map target. */
export const pierceVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec2 uMapWorld;
void main() {
  gl_Position = vec4(aPosition / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

// An area written into the darkness map as `uOut`: what a sense that sees in magical darkness
// perceives, at the level it sees there, in green; where a light would shine, in blue.
export const pierceFragment = `${GLSL_VERSION}
uniform vec4 uOut;
out vec4 finalColor;
void main() {
  finalColor = uOut;
}`;
