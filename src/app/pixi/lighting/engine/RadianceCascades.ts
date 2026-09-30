import { Mesh, TextureSource, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader, type Texture } from 'pixi.js';
import { BOUNCE } from '../../../lighting/lightingConstants';
import type { MapBounds } from '../../../vision/visibility';
import type { CapsuleField } from './CapsuleField';
import { cascadeFragment, cascadeVertex, emissionFragment, resolveFragment } from './cascadeShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import type { LightMap } from './LightMap';

type Pass = Mesh<Geometry, Shader>;

/** Where cascade `i`'s intervals start; each is four times longer than the last. */
function intervalStart(i: number): number {
  return (BOUNCE.interval * (4 ** i - 1)) / 3;
}

/**
 * World-space Radiance Cascades over the wall field, from the light map (see `cascadeShaders`):
 * `fluence` holds the light arriving at each cascade-0 probe, `BOUNCE.probe` px apart.
 */
export class RadianceCascades {
  readonly fluence: RenderTexture;
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  private readonly emit: RenderTexture;
  private readonly cascades: RenderTexture[];
  private readonly counts: Array<readonly [number, number]>;
  /** Bound in place of textures other objects own, so none is kept after a build. */
  private readonly placeholder: RenderTexture = createPlaceholder();
  private readonly emissionUniforms: UniformGroup;
  private readonly cascadeUniforms: UniformGroup;
  private readonly upCount = new Float32Array(2);
  private readonly lightWorld = new Float32Array(2);
  private readonly emission: Pass;
  private readonly cascade: Pass;
  private readonly resolve: Pass;

  constructor(private readonly renderer: Renderer, bounds: MapBounds, field: CapsuleField) {
    this.emit = createTarget(bounds.width / BOUNCE.emitTexel, bounds.height / BOUNCE.emitTexel, 'rgba16float');
    this.counts = Array.from({ length: BOUNCE.cascades }, (_, i) => {
      const spacing = BOUNCE.probe * 2 ** i;
      return [Math.ceil(bounds.width / spacing), Math.ceil(bounds.height / spacing)] as const;
    });
    this.cascades = this.counts.map(([cx, cy], i) => createTarget(cx * 2 ** (i + 1), cy * 2 ** (i + 1), 'rgba16float', 'nearest'));
    this.fluence = createTarget(this.counts[0]![0], this.counts[0]![1], 'rgba16float', 'nearest');
    const emitWorld = [this.emit.source.pixelWidth * BOUNCE.emitTexel, this.emit.source.pixelHeight * BOUNCE.emitTexel];
    this.emissionUniforms = new UniformGroup({
      uEmitWorld: { value: new Float32Array(emitWorld), type: 'vec2<f32>' },
      uLightWorld: { value: this.lightWorld, type: 'vec2<f32>' },
      uMapSize: { value: new Float32Array([bounds.width, bounds.height]), type: 'vec2<f32>' },
      uHasAlbedo: { value: 0, type: 'f32' },
    });
    this.cascadeUniforms = new UniformGroup({
      uEmitWorld: { value: new Float32Array(emitWorld), type: 'vec2<f32>' },
      uHasUpper: { value: 0, type: 'f32' },
      uSpacing: { value: 0, type: 'f32' },
      uS: { value: 0, type: 'f32' },
      uStart: { value: 0, type: 'f32' },
      uLen: { value: 0, type: 'f32' },
      uUpCount: { value: this.upCount, type: 'vec2<f32>' },
      uUpSpacing: { value: 0, type: 'f32' },
      uUpS: { value: 0, type: 'f32' },
      uUpStart: { value: 0, type: 'f32' },
      uSigma: { value: 1 / BOUNCE.spread, type: 'f32' },
      uFloorGain: { value: BOUNCE.floorGain, type: 'f32' },
      uWallGain: { value: BOUNCE.wallGain, type: 'f32' },
    });
    const placeholder = this.placeholder.source;
    this.emission = this.pass(emissionFragment, 'atlas-bounce-emission', { emissionUniforms: this.emissionUniforms, uLightMap: placeholder, uAlbedo: placeholder });
    this.cascade = this.pass(cascadeFragment, 'atlas-bounce-cascade', { cascadeUniforms: this.cascadeUniforms, uEmit: this.emit.source, uUpper: this.fluence.source, ...this.idleFieldResources(field) });
    this.resolve = this.pass(resolveFragment, 'atlas-bounce-resolve', { uC0: this.cascades[0]!.source });
  }

  /**
   * Bounces the light map off the floor (tinted by `albedo`, the map image, or mid grey without
   * one) and the walls of `field`, which may hold walls the direct light passes (one-way ones).
   * A map image destroyed before a throttled build (the map changed meanwhile) counts as none.
   */
  build(lightMap: LightMap, albedo: Texture | null, field: CapsuleField): void {
    const map = albedo && !albedo.destroyed && !albedo.source.destroyed ? albedo : null;
    const emission = this.emission.shader!;
    this.lightWorld.set(lightMap.world);
    this.emissionUniforms.uniforms.uHasAlbedo = map ? 1 : 0;
    emission.resources.uLightMap = lightMap.texture.source;
    if (map) emission.resources.uAlbedo = map.source;
    renderInto(this.renderer, this.emission, this.emit, [0, 0, 0, 0]);
    emission.resources.uLightMap = this.placeholder.source;
    emission.resources.uAlbedo = this.placeholder.source;

    const cascade = this.cascade.shader!;
    Object.assign(cascade.resources, field.resources());
    const c = this.cascadeUniforms.uniforms;
    for (let i = BOUNCE.cascades - 1; i >= 0; i--) {
      const top = i === BOUNCE.cascades - 1;
      c.uHasUpper = top ? 0 : 1;
      c.uSpacing = BOUNCE.probe * 2 ** i;
      c.uS = 2 ** (i + 1);
      c.uStart = intervalStart(i);
      c.uLen = BOUNCE.interval * 4 ** i;
      this.upCount.set(top ? [1, 1] : this.counts[i + 1]!);
      c.uUpSpacing = BOUNCE.probe * 2 ** (i + 1);
      c.uUpS = 2 ** (i + 2);
      c.uUpStart = intervalStart(i + 1);
      cascade.resources.uUpper = (top ? this.fluence : this.cascades[i + 1]!).source;
      renderInto(this.renderer, this.cascade, this.cascades[i]!, [0, 0, 0, 0]);
    }
    Object.assign(cascade.resources, this.idleFieldResources(field));
    renderInto(this.renderer, this.resolve, this.fluence, [0, 0, 0, 0]);
  }

  destroy(): void {
    for (const pass of [this.emission, this.cascade, this.resolve]) {
      pass.shader?.destroy();
      pass.destroy();
    }
    this.geometry.destroy();
    destroyQuad(this.quad);
    for (const texture of [this.placeholder, this.emit, this.fluence, ...this.cascades]) texture.destroy(true);
  }

  /** The field's resources with its texture swapped for the placeholder, which it keeps between builds. */
  private idleFieldResources(field: CapsuleField): ReturnType<CapsuleField['resources']> {
    return Object.fromEntries(Object.entries(field.resources()).map(([name, resource]) => [name, resource instanceof TextureSource ? this.placeholder.source : resource]));
  }

  private pass(fragment: string, name: string, resources: Record<string, UniformGroup | TextureSource>): Pass {
    return new Mesh({ geometry: this.geometry, shader: createShader(cascadeVertex, fragment, name, resources) });
  }
}
