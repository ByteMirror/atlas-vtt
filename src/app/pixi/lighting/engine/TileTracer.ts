import { Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import type { Rect } from '../../../lighting/segments';
import { CapsuleField } from './CapsuleField';
import { ENGINE_SHADERS } from './engineShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';

/**
 * Traces one light's visibility tile (`r8unorm`, one texel per field texel) through the wall
 * field, then smooths it within the free space around each texel (`tileSmoothShader.ts`).
 */
export class TileTracer {
  private readonly uniforms = new UniformGroup({
    uTileRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uLight: { value: new Float32Array(2), type: 'vec2<f32>' },
    uFlame: { value: 1, type: 'f32' },
    uTexel: { value: 1, type: 'f32' },
    uHasOneWay: { value: 0, type: 'f32' },
    uExtent: { value: new Float32Array(2), type: 'vec2<f32>' },
    uTexels: { value: new Float32Array(2), type: 'vec2<f32>' },
  });
  private readonly shader: Shader;
  private readonly smoothShader: Shader;
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly smoothMesh: Mesh<Geometry, Shader>;
  /** Bound as the smoothing input between traces, so the program never keeps a raw target. */
  private readonly placeholder: RenderTexture = createPlaceholder();
  /** Bound when a light has no one-way walls, so the program always has both fields. */
  private readonly noOneWay: CapsuleField;
  private noOneWayBuilt = false;
  /**
   * The raw traces' targets, used in turn so a trace never waits for the previous tile's
   * smoothing to finish reading; freed by `release`, grown to the largest tile each held.
   */
  private readonly raws: (RenderTexture | null)[] = [null, null];
  private turn = 0;

  constructor(private readonly renderer: Renderer, private readonly field: CapsuleField) {
    this.noOneWay = new CapsuleField(renderer, [0, 0, 1, 1], 1, 0, 'uOneWay');
    const resources = { tileUniforms: this.uniforms, ...field.resources(), ...this.noOneWay.resources() };
    this.shader = createShader(ENGINE_SHADERS.tile, resources);
    this.smoothShader = createShader(ENGINE_SHADERS.tileSmooth, { ...resources, uRaw: this.placeholder.source });
    this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader });
    this.smoothMesh = new Mesh({ geometry: this.geometry, shader: this.smoothShader });
  }

  /** `rect` must be snapped to the field's texel grid; `oneWay` holds this light's one-way walls. */
  trace(at: readonly [number, number], flame: number, rect: Rect, oneWay: CapsuleField | null): RenderTexture {
    const { texel } = this.field;
    // Built here, not in the constructor, which draws nothing (see `LightingWorld`).
    if (!this.noOneWayBuilt) {
      this.noOneWay.build([]);
      this.noOneWayBuilt = true;
    }
    const tile = createTarget(rect[2] / texel, rect[3] / texel, 'r8unorm', 'nearest');
    const { pixelWidth: width, pixelHeight: height } = tile.source;
    this.turn = 1 - this.turn;
    const raw = this.rawFor(width, height);
    const u = this.uniforms.uniforms;
    u.uTileRect.set([rect[0], rect[1], width * texel, height * texel]);
    u.uLight.set(at);
    u.uFlame = flame;
    u.uTexel = texel;
    u.uHasOneWay = oneWay ? 1 : 0;
    u.uTexels.set([width, height]);
    this.bindOneWay(oneWay ?? this.noOneWay);
    this.setExtent(raw, width, height);
    // The quad writes every texel the smoothing reads, so the raw target needs no clear.
    renderInto(this.renderer, this.mesh, raw);
    this.setExtent(tile, width, height);
    this.smoothShader.resources.uRaw = raw.source;
    renderInto(this.renderer, this.smoothMesh, tile, [0, 0, 0, 0]);
    // Raw targets are replaced or released and the caller destroys `oneWay` after the trace;
    // a destroyed texture must not stay bound.
    this.smoothShader.resources.uRaw = this.placeholder.source;
    if (oneWay) this.bindOneWay(this.noOneWay);
    return tile;
  }

  destroy(): void {
    this.mesh.destroy();
    this.smoothMesh.destroy();
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.shader.destroy();
    this.smoothShader.destroy();
    this.placeholder.destroy(true);
    this.noOneWay.destroy();
    this.release();
  }

  /** Frees the raw targets; the next trace allocates them again. */
  release(): void {
    for (let i = 0; i < this.raws.length; i++) {
      this.raws[i]?.destroy(true);
      this.raws[i] = null;
    }
  }

  private setExtent(target: RenderTexture, width: number, height: number): void {
    this.uniforms.uniforms.uExtent.set([width / target.source.pixelWidth, height / target.source.pixelHeight]);
  }

  private bindOneWay(field: CapsuleField): void {
    Object.assign(this.shader.resources, field.resources());
    Object.assign(this.smoothShader.resources, field.resources());
  }

  /** This turn's raw target, at least `width` × `height`: grown to the largest tile it held. */
  private rawFor(width: number, height: number): RenderTexture {
    const raw = this.raws[this.turn];
    const current = raw?.source;
    if (raw && current && current.pixelWidth >= width && current.pixelHeight >= height) return raw;
    const grown = createTarget(Math.max(width, current?.pixelWidth ?? 0), Math.max(height, current?.pixelHeight ?? 0), 'r8unorm', 'nearest');
    raw?.destroy(true);
    this.raws[this.turn] = grown;
    return grown;
  }
}
