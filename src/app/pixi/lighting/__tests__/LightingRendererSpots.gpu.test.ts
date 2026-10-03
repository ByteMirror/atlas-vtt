import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TokenEntity } from '../../../types';
import type { SceneLighting } from '../../../types/lightingTypes';
import { BUILT_IN_SENSES } from '../../../gameSystems/senses';
import type { SeenSpot } from '../../../vision/perception';
import type { SightRules } from '../../../vision/sightRules';
import { LightingEngine } from '../engine/LightingEngine';
import { watchGl, type GlWatch } from '../engine/__tests__/strictGl';
import { createHarness, visionToken, type Harness } from './rendererHarness';

/** A wall at x = 128 from top to bottom: the right half is out of sight from the left. */
const WALLS = { wall: { id: 'wall', kind: 'wall', type: 'solid', p1: { x: 128, y: 0 }, p2: { x: 128, y: 256 } } };
const NO_LIGHTS = {};
const START = { x: 48, y: 128 };
const HERO = visionToken(START.x, START.y);

describe('LightingRenderer shows the party where the picture is dark', () => {
  let harness: Harness | null = null;
  let watch: GlWatch | null = null;
  let spots: { x: number; y: number }[] | undefined;
  /** The footprints as the engine got them, with their outlines. */
  let given: readonly SeenSpot[] | undefined;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
    const update = Reflect.get(LightingEngine.prototype, 'update') as LightingEngine['update'];
    vi.spyOn(LightingEngine.prototype, 'update').mockImplementation(function (this: LightingEngine, scene) {
      spots = scene.spots?.map(({ x, y }) => ({ x, y }));
      given = scene.spots;
      update.call(this, scene);
    });
  });

  afterEach(() => {
    watch?.stop();
    watch = null;
    harness?.dispose();
    harness = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function tokenAt(x: number, token: TokenEntity = HERO): Record<string, unknown> {
    return { objects: { walls: WALLS, lights: NO_LIGHTS, tokens: { t: { ...token, x } } } };
  }

  it('hands the engine a footprint cut by the wall its token stands at', async () => {
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 0 }, objects: { walls: WALLS, lights: NO_LIGHTS, tokens: { t: visionToken(120, 128) } } } });
    await harness.settle();
    expect(given).toHaveLength(1);
    const xs = given![0]!.polygon.map((point) => point.x);
    expect(given![0]!.radius).toBeGreaterThan(20);
    expect(Math.max(...xs)).toBeLessThanOrEqual(128.001);
    expect(Math.min(...xs)).toBeLessThan(100);
  });

  it('works sight and the footprints out by the rules of the map\'s collection', async () => {
    const rules: SightRules = {
      definitions: BUILT_IN_SENSES['builtin:pathfinder2e']!,
      conditions: [{ id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' }, { id: 'gone', name: 'Undetected', color: '#000000', effect: 'undetected' }],
    };
    const bat = { ...visionToken(48, 128), vision: { enabled: true, senses: [{ id: 'pathfinder2e-echolocation', range: 40 }] }, conditions: ['blind'] } as TokenEntity;
    const prey = { id: 'prey', x: 88, y: 128 } as unknown as TokenEntity;
    const hidden = { id: 'hidden', x: 48, y: 170, conditions: ['gone'] } as unknown as TokenEntity;
    harness = await createHarness({
      patch: { exploredMask: null, lighting: { enabled: true, ambient: 0 }, objects: { walls: {}, lights: NO_LIGHTS, tokens: { t: bat, prey, hidden } } },
      rules: () => rules,
    });
    await harness.settle();
    // Blinded, the bat keeps only the sense that needs no eyes: without the rules it would have sight and no echolocation.
    expect(harness.lighting.currentSight().regions.map((region) => region.sense.id)).toEqual(['pathfinder2e-echolocation']);
    // Its echolocation finds the prey; a token no sense perceives gets no footprint.
    expect(spots).toEqual([{ x: 48, y: 128 }, { x: 88, y: 128 }]);
  });

  async function setup(lighting: Partial<SceneLighting>): Promise<Harness> {
    harness = await createHarness({ patch: { exploredMask: null, lighting: { enabled: true, ambient: 0, ...lighting }, ...tokenAt(START.x) } });
    await harness.settle();
    watch = watchGl(harness.renderer.gl);
    return harness;
  }

  it('gives the engine the footprint of a party token that stands in darkness, and none in light', async () => {
    const h = await setup({ ambient: 0 });
    expect(spots).toEqual([START]);
    h.renderStage();
    h.change({ lighting: { enabled: true, ambient: 1 } });
    expect(spots).toEqual([]);
    h.change({ lighting: { enabled: true, ambient: 0.15 } });
    expect(spots).toEqual([START]);
    h.renderStage();
    expect(watch!.findings).toEqual([]);
  });

  it('lets the footprint follow a dragged party token without building sight anew, and ends it beyond the sight left behind, where the scene waits for the drop', async () => {
    const h = await setup({ ambient: 0, sightOnDrop: true });
    h.renderStage();
    const sight = h.lighting.currentSight();
    h.change({ heldTokens: { t: START } });
    h.change(tokenAt(100));
    expect(spots).toEqual([{ x: 100, y: 128 }]);
    expect(h.lighting.currentSight()).toBe(sight);
    h.renderStage();
    // Past the wall the sight that stayed behind does not reach: the token is hidden until the drop.
    h.change(tokenAt(200));
    expect(spots).toEqual([]);
    expect(h.lighting.currentSight()).toBe(sight);
    h.renderStage();
    h.change({ heldTokens: {} });
    expect(spots).toEqual([{ x: 200, y: 128 }]);
    expect(h.lighting.currentSight()).not.toBe(sight);
    h.renderStage();
    expect(watch!.findings).toEqual([]);
  });

  it('gives none while the scene has token vision off: nothing is hidden by sight then', async () => {
    await setup({ ambient: 0, tokenVision: false });
    expect(spots).toEqual([]);
  });
});
