import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIGHT_PRESETS } from '../../../lighting/lightPresets';
import type { LightSource } from '../../../types/lightingTypes';
import { lightLevelAt } from '../../../vision/lightLevels';
import type { LightingEngine } from '../engine/LightingEngine';
import { renderThroughEngine, type PixelReader } from '../engine/__tests__/gpuTestUtils';
import { SIZE, createHarness, type Harness } from './rendererHarness';

/** A street lamp in the middle of the map (bright to 4 cells on the default grid) that shines from dusk on. */
const lamp: LightSource = { id: 'lamp', kind: 'light', x: 128, y: 128, emission: { ...LIGHT_PRESETS.torch.emission, color: '#ffffff', animation: 'none' }, activeBelowAmbient: 0.5 };
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

describe('LightingRenderer: lights that follow the ambient light', () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
  });

  afterEach(() => {
    harness?.dispose();
    harness = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function setup(ambient: number, lights: Record<string, LightSource>): Promise<Harness> {
    harness = await createHarness({ patch: { lighting: { enabled: true, ambient, tokenVision: false }, objects: { walls: {}, lights, tokens: {} } } });
    await harness.settle();
    return harness;
  }

  /** The players' view of a white map, one screen pixel per world pixel. */
  function playerView(): PixelReader {
    const { lighting, renderer } = harness!;
    lighting.modeLayer.visible = true;
    const engine = (lighting as unknown as { engine: LightingEngine }).engine;
    engine.flush();
    return renderThroughEngine(engine, renderer, { size: SIZE, scale: 1, x: 0, y: 0 });
  }

  it('shows the lamp neither in the picture nor to the rule by day, and in both from dusk on', async () => {
    const { lighting, state, change } = await setup(0.6, { lamp });
    const dayWithLamp = playerView()(128, 128);
    expect(lighting.lightReaches()).toHaveLength(0);
    expect(lightLevelAt({ x: 128, y: 128 }, state.lighting, lighting.lightReaches())).toBe('dim');

    change({ lighting: { ...state.lighting, ambient: 0.5 } });
    const dusk = playerView()(128, 128);
    expect(lighting.lightReaches()).toHaveLength(1);
    expect(lightLevelAt({ x: 128, y: 128 }, harness!.state.lighting, lighting.lightReaches())).toBe('bright');
    expect(luminance(dusk)).toBeGreaterThan(luminance(dayWithLamp) + 40);

    change({ lighting: { ...harness!.state.lighting, ambient: 0.6 } });
    expect(lighting.lightReaches()).toHaveLength(0);
    expect(playerView()(128, 128)).toEqual(dayWithLamp);
  });

  it('draws a day with a sleeping lamp exactly as a day without it', async () => {
    await setup(0.6, { lamp });
    const withLamp = playerView();
    const samples = [[128, 128], [60, 200], [200, 40], [10, 10]] as const;
    const first = samples.map(([x, y]) => withLamp(x, y));
    harness!.dispose();
    await setup(0.6, {});
    const without = playerView();
    expect(samples.map(([x, y]) => without(x, y))).toEqual(first);
  });
});
