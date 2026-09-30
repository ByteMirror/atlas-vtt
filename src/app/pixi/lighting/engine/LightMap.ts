import { Container, Mesh, Shader, UniformGroup, type Geometry, type Renderer, type RenderTexture } from 'pixi.js';
import { FALLOFF_HEIGHT } from '../../../lighting/lightingConstants';
import type { MapBounds } from '../../../vision/visibility';
import { GLSL_VERSION } from './glsl';
import { createQuad, createTarget, quadGeometry, renderInto, type Quad } from './gpu';
import type { Tile } from './TileCache';

const vertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec4 uRect;
uniform vec2 uMapWorld;
out vec2 vWorld;
void main() {
  vWorld = uRect.xy + aPosition * uRect.zw;
  gl_Position = vec4(vWorld / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

// Height falloff E ∝ (d² + h²)^(−3/2): a lamp above the floor, round and hot under it, then
// inverse-square; normalised to ½ at the bright radius and windowed to exactly zero at the
// reach (Karis). A light without a bright radius uses a quarter of its reach as one. The tile
// is read with texelFetch: its rect sits on this map's texel grid, so a texel here is a texel there.
const fragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec4 uRect;
uniform vec2 uLight;
uniform float uBright;
uniform float uReach;
uniform float uIntensity;
uniform vec3 uColor;
uniform float uHeight;
uniform float uTexel;
uniform sampler2D uTile;
out vec4 finalColor;
void main() {
  ivec2 texel = ivec2(floor((vWorld - uRect.xy) / uTexel));
  ivec2 size = textureSize(uTile, 0);
  if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, size))) discard;
  float d = distance(vWorld, uLight);
  float b = max(uBright, uReach * 0.25);
  float h = b * uHeight;
  float e = 0.5 * pow((1.0 + d * d / (h * h)) / (1.0 + b * b / (h * h)), -1.5);
  float q = d / uReach;
  float window = clamp(1.0 - q * q * q * q, 0.0, 1.0);
  finalColor = vec4(uColor * uIntensity * e * window * window * texelFetch(uTile, texel, 0).r, 1.0);
}`;

/** One light's contribution this frame (radii already scaled by flicker). */
export interface DrawnLight {
  tile: Tile;
  bright: number;
  reach: number;
  color: readonly [number, number, number];
  intensity: number;
}

interface Slot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  light: Float32Array;
  color: Float32Array;
}

/**
 * Every light's direct light over the map in world space (`rgba16float`, HDR): independent of
 * any camera, so the GM view and the player window read the same texture.
 */
export class LightMap {
  readonly texture: RenderTexture;
  readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly slots: Slot[] = [];
  private readonly quad: Quad = createQuad();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
  }

  draw(lights: readonly DrawnLight[]): void {
    while (this.slots.length < lights.length) this.slots.push(this.createSlot());
    this.slots.forEach((slot, i) => {
      const light = lights[i];
      slot.mesh.visible = !!light;
      if (!light) return;
      const u = slot.uniforms.uniforms;
      slot.rect.set(light.tile.rect);
      slot.light.set([light.tile.x, light.tile.y]);
      u.uBright = light.bright;
      u.uReach = light.reach;
      u.uIntensity = light.intensity;
      slot.color.set(light.color);
      slot.uniforms.update();
      slot.mesh.shader!.resources.uTile = light.tile.texture.source;
    });
    renderInto(this.renderer, this.scene, this.texture, [0, 0, 0, 0]);
  }

  private createSlot(): Slot {
    const rect = new Float32Array(4);
    const light = new Float32Array(2);
    const color = new Float32Array(3);
    const uniforms = new UniformGroup({
      uRect: { value: rect, type: 'vec4<f32>' },
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uLight: { value: light, type: 'vec2<f32>' },
      uBright: { value: 0, type: 'f32' },
      uReach: { value: 1, type: 'f32' },
      uIntensity: { value: 1, type: 'f32' },
      uColor: { value: color, type: 'vec3<f32>' },
      uHeight: { value: FALLOFF_HEIGHT, type: 'f32' },
      uTexel: { value: this.texel, type: 'f32' },
    });
    const shader = Shader.from({
      gl: { vertex, fragment, name: 'atlas-light-map', preferredFragmentPrecision: 'highp' },
      resources: { lightUniforms: uniforms, uTile: this.texture.source },
    });
    const mesh = new Mesh({ geometry: quadGeometry(this.quad), shader });
    mesh.blendMode = 'add';
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, light, color };
  }

  destroy(): void {
    for (const { mesh } of this.slots) {
      mesh.shader?.destroy();
      mesh.destroy();
    }
    this.texture.destroy(true);
  }
}
