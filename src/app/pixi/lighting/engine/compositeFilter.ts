import {
  Color,
  Filter,
  Matrix,
  Sprite,
  Texture,
  UniformGroup,
  type FilterWithShader,
  type FilterSystem,
  type RenderSurface,
} from 'pixi.js';
import { BOUNCE, DARKNESS, EXPOSURE, PURKINJE, wallBand, wallCore } from '../../../lighting/lightingConstants';
import { DEFAULT_AMBIENT_COLOR, DEFAULT_EXPLORED_COLOR, DEFAULT_UNEXPLORED_COLOR } from '../../../lighting/sceneLightingOptions';
import { srgbToLinear } from '../../../lighting/srgb';
import { ENGINE_SHADERS } from './engineShaders';
import type { DarknessMap } from './DarknessMap';
import type { ZoneMap } from './ZoneMap';
import { createPlaceholder, engineProgram } from './gpu';
import type { LightingWorld } from './LightingWorld';
import { DARK_SIGHT_LEVELS, darkLooks, type DarkLooks } from './senseDrawing';
import { SEES_ALL } from '../../../vision/sight';

export type LightingMode = 'gm' | 'player';

/** Final pass of the lighting layer: lights the scene beneath it and hides what no one sees. */
export interface CompositeFilter {
  filter: Filter;
  /** Binds `world`'s textures; call before the previous world is destroyed. */
  setWorld(world: LightingWorld): void;
  /**
   * The colour is picked in sRGB; the composite adds light in linear light. `lift` is how much
   * the ambient light is raised where dim light is perceived as bright (`ambientLift`).
   */
  setAmbient(level: number, color: string | undefined, lift: number): void;
  /** How what is perceived without light is drawn. */
  setDarkLooks(looks: DarkLooks): void;
  /** The world's darkness map while the scene has a darkness source, null otherwise: nothing of it is read then. */
  setDarkness(map: DarknessMap | null): void;
  /** The world's zone map while the scene has an ambient zone, null otherwise: nothing of it is read then. */
  setZones(map: ZoneMap | null): void;
  /** Both of the above. */
  setMaps(darkness: DarknessMap | null, zones: ZoneMap | null): void;
  setMode(mode: LightingMode): void;
  /** No token has vision: line of sight hides nothing. */
  setAllSeen(all: boolean): void;
  /** Off, the player view shows no explored memory: what no token sees takes the unexplored colour. */
  setMemoryShown(shown: boolean): void;
  /** Tint of remembered areas and fill of never-seen ones in the player view, picked in sRGB. */
  setMemoryColours(explored: string | undefined, unexplored: string | undefined): void;
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
  const exploredTint = new Float32Array([1, 1, 1]);
  const unexplored = new Float32Array(3);
  const greyTint = new Float32Array(3);
  const darkTint = new Float32Array([1, 1, 1]);
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
    uMemory: { value: 1, type: 'f32' },
    uExploredTint: { value: exploredTint, type: 'vec3<f32>' },
    uUnexplored: { value: unexplored, type: 'vec3<f32>' },
    uGreyKeep: { value: 0, type: 'f32' },
    uGreyTint: { value: greyTint, type: 'vec3<f32>' },
    uDarkTint: { value: darkTint, type: 'vec3<f32>' },
    uDarkTinted: { value: 0, type: 'f32' },
    uColourLevel: { value: 0, type: 'f32' },
    uAmbientLift: { value: 1, type: 'f32' },
    uHasDarkness: { value: 0, type: 'f32' },
    uHasZones: { value: 0, type: 'f32' },
    uVeil: { value: new Float32Array(DARKNESS.veil), type: 'vec3<f32>' },
    uGmVeil: { value: new Float32Array(DARKNESS.gmVeil), type: 'vec3<f32>' },
    uGreyLevel: { value: 0, type: 'f32' },
    uDarkLevels: { value: new Float32Array([DARK_SIGHT_LEVELS.dim, DARK_SIGHT_LEVELS.bright]), type: 'vec2<f32>' },
    uFluSpacing: { value: BOUNCE.probe, type: 'f32' },
  });
  const u = group.uniforms;
  // Bound while the scene has no darkness source and no ambient zone, so the filter never holds a destroyed map.
  const noDarkness = createPlaceholder();
  let darkness: DarknessMap | null = null;
  let zones: ZoneMap | null = null;
  const filter = new AreaAwareFilter({
    glProgram: engineProgram(ENGINE_SHADERS.composite),
    resources: {
      compositeUniforms: group,
      uExplored: explored.source,
      uLightMap: world.lightMap.texture.source,
      uFluence: world.cascades.fluence.source,
      uDarkness: noDarkness.source,
      uZones: noDarkness.source,
      uZonesLifted: noDarkness.source,
      ...fieldResources(world),
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
      Object.assign(filter.resources, { uLightMap: next.lightMap.texture.source, uFluence: next.cascades.fluence.source, ...fieldResources(next) });
      group.update();
    },
    setAmbient(level, color, lift): void {
      setLinear(ambient, color ?? DEFAULT_AMBIENT_COLOR, level);
      u.uAmbientLift = lift;
      group.update();
    },
    setDarkLooks(looks): void {
      u.uGreyKeep = looks.greyKeep;
      greyTint.set(looks.greyTint);
      darkTint.set(looks.tint ?? [1, 1, 1]);
      u.uDarkTinted = looks.tint ? 1 : 0;
      u.uGreyLevel = looks.greyLevel;
      u.uColourLevel = looks.colourLevel;
      group.update();
    },
    setDarkness(map): void {
      if (map === darkness) return;
      darkness = map;
      filter.resources.uDarkness = (map?.texture ?? noDarkness).source;
      u.uHasDarkness = map ? 1 : 0;
      group.update();
    },
    setZones(map): void {
      if (map === zones) return;
      zones = map;
      filter.resources.uZones = (map?.texture ?? noDarkness).source;
      filter.resources.uZonesLifted = (map?.lifted ?? noDarkness).source;
      u.uHasZones = map ? 1 : 0;
      group.update();
    },
    setMaps(darknessMap, zoneMap): void {
      composite.setDarkness(darknessMap);
      composite.setZones(zoneMap);
    },
    setMode(mode): void {
      u.uMode = mode === 'player' ? 1 : 0;
      group.update();
    },
    setAllSeen(all): void {
      u.uAllSeen = all ? 1 : 0;
      group.update();
    },
    setMemoryShown(shown): void {
      u.uMemory = shown ? 1 : 0;
      group.update();
    },
    setMemoryColours(explored, unexploredColor): void {
      setLinear(exploredTint, explored ?? DEFAULT_EXPLORED_COLOR);
      setLinear(unexplored, unexploredColor ?? DEFAULT_UNEXPLORED_COLOR);
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
  const destroy = filter.destroy.bind(filter);
  filter.destroy = (destroyPrograms?: boolean): void => {
    // The filter lets go of the placeholder before it is destroyed.
    destroy(destroyPrograms);
    noDarkness.destroy(true);
  };
  composite.setWorld(world);
  composite.setDarkLooks(darkLooks(SEES_ALL));
  return composite;
}

/** The world's two wall fields under the names the composite reads them by: the walls that stop light, and those that stop sight. */
function fieldResources(world: LightingWorld): ReturnType<LightingWorld['fields']['tiles']['resources']> {
  const { light, sight } = world.fields.bound();
  return { ...light.resources(), ...sight.resourcesAs('uSightField') };
}

/** Writes an sRGB colour into `out` in linear light, scaled by `level`. */
function setLinear(out: Float32Array, color: string, level = 1): void {
  const c = new Color(color);
  out.set([srgbToLinear(c.red) * level, srgbToLinear(c.green) * level, srgbToLinear(c.blue) * level]);
}
