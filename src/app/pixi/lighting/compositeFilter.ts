import { Color, Filter, GlProgram, Matrix, UniformGroup, defaultFilterVert, type Texture } from 'pixi.js';
import { LIGHT_ENCODING } from './lightShaders';

export type LightingMode = 'gm' | 'player';

/** Final pass of the lighting layer: lights the scene beneath it and hides what no one sees. */
export interface CompositeFilter {
  filter: Filter;
  setAmbient(level: number, color: string | undefined): void;
  setMode(mode: LightingMode): void;
  /** No token has vision: line of sight hides nothing. */
  setAllSeen(all: boolean): void;
  /** How far the edge of what is seen fades, in screen pixels at the current zoom. */
  setSightSoftness(pixels: number): void;
  setExplored(texture: Texture): void;
  /** Maps global (screen) pixels to explored-texture coordinates; set every frame from the layer's transform. */
  setScreenToExplored(matrix: Matrix): void;
}

// uTexture holds the lighting layer: light (encoded) in rgb, sight in alpha
// (0.5 = in line of sight, 1 = also within darkvision). uBackTexture is the scene beneath.
const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform sampler2D uExplored;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec3 uAmbient;
uniform float uMode;
uniform float uAllSeen;
uniform float uSightSoftness;
uniform vec4 uInputClamp;

// Share of the neighbourhood in line of sight, so the edge of what is seen fades over
// uSightSoftness pixels instead of cutting hard along walls and door frames.
float seenAround(vec2 uv) {
  float seen = step(0.25, texture(uTexture, uv).a) * 0.12;
  vec2 radius = uSightSoftness / uInputSize.xy;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.7854;
    vec2 direction = vec2(cos(angle), sin(angle)) * radius;
    // Inner ring turned half a step against the outer one, so the taps do not line up into bands.
    vec2 inner = vec2(cos(angle + 0.3927), sin(angle + 0.3927)) * radius * 0.5;
    seen += step(0.25, texture(uTexture, clamp(uv + inner, uInputClamp.xy, uInputClamp.zw)).a) * 0.07;
    seen += step(0.25, texture(uTexture, clamp(uv + direction, uInputClamp.xy, uInputClamp.zw)).a) * 0.04;
  }
  return smoothstep(0.0, 1.0, seen);
}
uniform mat3 uScreenToExplored;

// Whichever colour is brighter, blended near a tie. A per-channel max would mix the two
// (orange light over a grey floor turns pink).
vec3 brighter(vec3 a, vec3 b) {
  float difference = dot(b - a, vec3(0.299, 0.587, 0.114));
  return mix(a, b, smoothstep(-0.06, 0.06, difference));
}

void main() {
  vec4 acc = texture(uTexture, vTextureCoord);
  vec3 base = texture(uBackTexture, vTextureCoord).rgb;
  vec3 light = uAmbient + acc.rgb / ${LIGHT_ENCODING.toFixed(2)};
  // Linear up to full light, then a soft roll-off, so overlapping lights glow instead of clipping.
  vec3 mapped = min(light, 1.0) + max(light - 1.0, 0.0) / (1.0 + max(light - 1.0, 0.0)) * 0.35;
  vec3 lit = base * mapped;

  float seen = max(uAllSeen, seenAround(vTextureCoord));
  float darkvision = step(0.75, acc.a);
  float grey = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 darkSight = mix(vec3(grey), base, 0.15) * 0.45;
  // Darkvision shows the scene grey where light is weaker than it, never mixing the two.
  vec3 visible = mix(lit, brighter(lit, darkSight), darkvision);

  vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy;
  vec2 exploredUv = (uScreenToExplored * vec3(screen, 1.0)).xy;
  float explored = texture(uExplored, clamp(exploredUv, 0.0, 1.0)).r;
  vec3 memory = vec3(grey) * 0.3 * explored;

  vec3 player = mix(memory, visible, seen);
  // The GM always sees the map: a dim floor screen-blended under the light, so light fades
  // into it smoothly instead of ending where the two are equally bright.
  vec3 floorColor = base * 0.25;
  vec3 gmSeen = 1.0 - (1.0 - visible) * (1.0 - floorColor);
  vec3 gm = mix((1.0 - (1.0 - lit) * (1.0 - floorColor)) * 0.78, gmSeen, seen);
  finalColor = vec4(uMode > 0.5 ? player : gm, 1.0);
}`;

function toRgb(color: string | undefined): [number, number, number] {
  const rgb = new Color(color ?? '#ffffff');
  return [rgb.red, rgb.green, rgb.blue];
}

export function createCompositeFilter(explored: Texture): CompositeFilter {
  const group = new UniformGroup({
    uAmbient: { value: new Float32Array([0, 0, 0]), type: 'vec3<f32>' },
    uMode: { value: 0, type: 'f32' },
    uAllSeen: { value: 1, type: 'f32' },
    uSightSoftness: { value: 0, type: 'f32' },
    uScreenToExplored: { value: new Matrix(), type: 'mat3x3<f32>' },
  });
  const { uniforms } = group;
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name: 'atlas-lighting-composite', preferredFragmentPrecision: 'highp' }),
    resources: { compositeUniforms: group, uExplored: explored.source },
    blendRequired: true,
    resolution: 'inherit',
  });
  const update = (): void => group.update();
  return {
    filter,
    setAmbient(level, color): void {
      const [r, g, b] = toRgb(color);
      uniforms.uAmbient.set([r * level, g * level, b * level]);
      update();
    },
    setMode(mode): void {
      uniforms.uMode = mode === 'player' ? 1 : 0;
      update();
    },
    setSightSoftness(pixels): void {
      uniforms.uSightSoftness = pixels;
      update();
    },
    setAllSeen(all): void {
      uniforms.uAllSeen = all ? 1 : 0;
      update();
    },
    setExplored(texture): void {
      filter.resources.uExplored = texture.source;
    },
    setScreenToExplored(matrix): void {
      uniforms.uScreenToExplored.copyFrom(matrix);
      update();
    },
  };
}
