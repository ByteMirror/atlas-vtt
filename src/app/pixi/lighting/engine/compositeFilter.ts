import {
  Color,
  Filter,
  GlProgram,
  Matrix,
  Sprite,
  Texture,
  UniformGroup,
  defaultFilterVert,
  type FilterWithShader,
  type FilterSystem,
  type RenderSurface,
} from 'pixi.js';
import { BOUNCE, EXPOSURE, PURKINJE, wallBand, wallCore } from '../../../lighting/lightingConstants';
import { srgbToLinear } from '../../../lighting/srgb';
import { compositeFragment } from './compositeShader';
import { HIGHP } from './gpu';
import type { LightingWorld } from './LightingWorld';

export type LightingMode = 'gm' | 'player';

/** Final pass of the lighting layer: lights the scene beneath it and hides what no one sees. */
export interface CompositeFilter {
  filter: Filter;
  /** Binds `world`'s textures; call before the previous world is destroyed. */
  setWorld(world: LightingWorld): void;
  /** The colour is picked in sRGB; the composite adds light in linear light. */
  setAmbient(level: number, color: string | undefined): void;
  setMode(mode: LightingMode): void;
  /** No token has vision: line of sight hides nothing. */
  setAllSeen(all: boolean): void;
  /** The caller owns `texture` and rebinds before destroying it. */
  setExplored(texture: Texture): void;
  /** Maps screen pixels of the render being drawn to world pixels; `zoom` is screen px per world px. */
  setView(screenToWorld: Matrix, zoom: number): void;
}

/**
 * PIXI tells a filter where its area starts on screen (`uOutputFrame`) only when it is the last
 * of its chain. `calculateSpriteMatrix` for a sprite at the origin with a 1 px texture maps
 * input coordinates to screen pixels, so its translation is that start for any position.
 */
class AreaAwareFilter extends Filter {
  private readonly probe = new Sprite(Texture.WHITE);
  private readonly probeMatrix = new Matrix();

  constructor(options: FilterWithShader, private readonly origin: Float32Array, private readonly group: UniformGroup) {
    super(options);
  }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    const { tx, ty } = filterManager.calculateSpriteMatrix(this.probeMatrix, this.probe);
    this.origin[0] = tx;
    this.origin[1] = ty;
    this.group.update();
    filterManager.applyFilter(this, input, output, clearMode);
  }

  override destroy(destroyPrograms = false): void {
    this.probe.destroy();
    super.destroy(destroyPrograms);
  }
}

export function createCompositeFilter(world: LightingWorld, explored: Texture): CompositeFilter {
  const screenToWorld = new Matrix();
  const areaOrigin = new Float32Array(2);
  const lightWorld = new Float32Array(2);
  const mapSize = new Float32Array(2);
  const ambient = new Float32Array(3);
  const group = new UniformGroup({
    uScreenToWorld: { value: screenToWorld, type: 'mat3x3<f32>' },
    uPixelWorld: { value: 1, type: 'f32' },
    uCore: { value: 0, type: 'f32' },
    uBand: { value: 0, type: 'f32' },
    uTexel: { value: 1, type: 'f32' },
    uAreaOrigin: { value: areaOrigin, type: 'vec2<f32>' },
    uLightWorld: { value: lightWorld, type: 'vec2<f32>' },
    uMapSize: { value: mapSize, type: 'vec2<f32>' },
    uAmbient: { value: ambient, type: 'vec3<f32>' },
    uExposure: { value: EXPOSURE, type: 'f32' },
    uBounceGain: { value: BOUNCE.gain, type: 'f32' },
    uPurkinje: { value: PURKINJE, type: 'f32' },
    uMode: { value: 0, type: 'f32' },
    uAllSeen: { value: 1, type: 'f32' },
    uFluSpacing: { value: BOUNCE.probe, type: 'f32' },
  });
  const u = group.uniforms;
  const filter = new AreaAwareFilter({
    glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: compositeFragment, name: 'atlas-lighting-composite', preferredFragmentPrecision: HIGHP }),
    resources: {
      compositeUniforms: group,
      uExplored: explored.source,
      uLightMap: world.lightMap.texture.source,
      uFluence: world.cascades.fluence.source,
      ...world.fieldAll().resources(),
    },
    blendRequired: true,
    resolution: 'inherit',
  }, areaOrigin, group);
  const composite: CompositeFilter = {
    filter,
    setWorld(next): void {
      lightWorld.set(next.lightMap.world);
      mapSize.set([next.bounds.width, next.bounds.height]);
      u.uCore = wallCore(next.texel);
      u.uBand = wallBand(next.texel);
      u.uTexel = next.texel;
      Object.assign(filter.resources, { uLightMap: next.lightMap.texture.source, uFluence: next.cascades.fluence.source, ...next.fieldAll().resources() });
      group.update();
    },
    setAmbient(level, color): void {
      const c = new Color(color ?? '#ffffff');
      ambient.set([srgbToLinear(c.red) * level, srgbToLinear(c.green) * level, srgbToLinear(c.blue) * level]);
      group.update();
    },
    setMode(mode): void {
      u.uMode = mode === 'player' ? 1 : 0;
      group.update();
    },
    setAllSeen(all): void {
      u.uAllSeen = all ? 1 : 0;
      group.update();
    },
    setExplored(texture): void {
      filter.resources.uExplored = texture.source;
    },
    setView(matrix, zoom): void {
      screenToWorld.copyFrom(matrix);
      u.uPixelWorld = 1 / zoom;
      group.update();
    },
  };
  composite.setWorld(world);
  return composite;
}
