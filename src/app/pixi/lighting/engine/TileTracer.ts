import { Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import type { Rect } from '../../../lighting/segments';
import { CapsuleField } from './CapsuleField';
import { createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import { tileFragment, tileVertex } from './tileShader';

/** Traces one light's visibility tile (`r8unorm`, one texel per field texel) through the wall field. */
export class TileTracer {
  private readonly uniforms = new UniformGroup({
    uTileRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uLight: { value: new Float32Array(2), type: 'vec2<f32>' },
    uFlame: { value: 1, type: 'f32' },
    uTexel: { value: 1, type: 'f32' },
    uHasOneWay: { value: 0, type: 'f32' },
  });
  private readonly shader: Shader;
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  private readonly mesh: Mesh<Geometry, Shader>;
  /** Bound when a light has no one-way walls, so the program always has both fields. */
  private readonly noOneWay: CapsuleField;

  constructor(private readonly renderer: Renderer, private readonly field: CapsuleField) {
    this.noOneWay = new CapsuleField(renderer, [0, 0, 1, 1], 1, 0, 'uOneWay');
    this.noOneWay.build([]);
    this.shader = createShader(tileVertex, tileFragment, 'atlas-visibility-tile', { tileUniforms: this.uniforms, ...field.resources(), ...this.noOneWay.resources() });
    this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader });
  }

  /** `rect` must be snapped to the field's texel grid; `oneWay` holds this light's one-way walls. */
  trace(at: readonly [number, number], flame: number, rect: Rect, oneWay: CapsuleField | null): RenderTexture {
    const { texel } = this.field;
    const tile = createTarget(rect[2] / texel, rect[3] / texel, 'r8unorm', 'nearest');
    const u = this.uniforms.uniforms;
    u.uTileRect.set([rect[0], rect[1], tile.source.pixelWidth * texel, tile.source.pixelHeight * texel]);
    u.uLight.set(at);
    u.uFlame = flame;
    u.uTexel = texel;
    u.uHasOneWay = oneWay ? 1 : 0;
    Object.assign(this.shader.resources, (oneWay ?? this.noOneWay).resources());
    renderInto(this.renderer, this.mesh, tile, [0, 0, 0, 0]);
    // The caller destroys `oneWay` after the trace; a destroyed texture must not stay bound.
    if (oneWay) Object.assign(this.shader.resources, this.noOneWay.resources());
    return tile;
  }

  destroy(): void {
    this.mesh.destroy();
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.shader.destroy();
    this.noOneWay.destroy();
  }
}
