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

  float seen = max(uAllSeen, step(0.25, acc.a));
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
  vec3 floorColor = base * 0.3;
  vec3 gm = mix(brighter(lit, floorColor) * 0.6, brighter(visible, floorColor), seen);
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
