import { Container, Sprite, Texture, type Application, type WebGLRenderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewAtlasState, ViewAtlasStore } from '../../../storeFactory';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import type { TokenEntity } from '../../../types';
import { createTestRenderer, readRgba } from '../engine/__tests__/gpuTestUtils';
import { ExploredTexture } from '../ExploredTexture';
import { LightingRenderer } from '../LightingRenderer';
import { saveExploredMask } from '../exploredMaskSaving';

const SIZE = 256;
const SAVE_DELAY = 2000;

interface Harness {
  renderer: WebGLRenderer;
  lighting: LightingRenderer;
  state: ViewAtlasState;
  setExploredMask: ReturnType<typeof vi.fn>;
  /** Applies a change to the state and tells the renderer, as the store does. */
  change: (patch: Partial<ViewAtlasState>) => void;
  redAt: (x: number, y: number) => number;
  /** Resolves once every mask load started so far has finished. */
  loaded: () => Promise<unknown>;
}

function visionToken(x: number): TokenEntity {
  return { id: 't', x, y: 128, vision: { enabled: true } } as unknown as TokenEntity;
}

describe('LightingRenderer explored memory across a GPU reset', () => {
  const cleanup: (() => void)[] = [];

  beforeEach(() => {
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    while (cleanup.length) cleanup.pop()!();
  });

  /** A saved memory that has seen the whole map. */
  async function fullMask(renderer: WebGLRenderer): Promise<string> {
    const explored = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
    const white = new Sprite(Texture.WHITE);
    white.setSize(explored.texture.width, explored.texture.height);
    renderer.render({ container: white, target: explored.texture, clear: true });
    const mask = saveExploredMask(explored.toCanvas());
    explored.destroy();
    return mask;
  }

  async function setup(patch: Record<string, unknown> = {}): Promise<Harness> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const setExploredMask = vi.fn();
    const load = vi.spyOn(ExploredTexture.prototype, 'load');
    const listeners = new Set<(state: ViewAtlasState) => void>();
    const state = {
      mapPath: 'a.atlasmap',
      lighting: { enabled: true, ambient: 1 },
      objects: { walls: {}, lights: {}, tokens: {} },
      grid: null,
      exploredMask: await fullMask(renderer),
      setExploredMask,
      ...patch,
    } as unknown as ViewAtlasState;
    const store = { getState: () => state, subscribe: (listener: (next: ViewAtlasState) => void) => (listeners.add(listener), () => listeners.delete(listener)) } as unknown as ViewAtlasStore;
    const app = { renderer, ticker: { add: vi.fn(), remove: vi.fn() } } as unknown as Application;
    const lighting = new LightingRenderer({
      viewport: new Container() as unknown as Viewport,
      app,
      store,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds: () => ({ width: SIZE, height: SIZE }),
      albedo: () => null,
    });
    cleanup.push(() => lighting.destroy());
    const explored = (): ExploredTexture => (lighting as unknown as { explored: ExploredTexture }).explored;
    return {
      loaded: () => Promise.all(load.mock.results.map((result) => result.value as Promise<void>)),
      renderer,
      lighting,
      state,
      setExploredMask,
      change: (next) => {
        Object.assign(state, next);
        for (const listener of listeners) listener(state);
      },
      redAt: (x, y) => readRgba(renderer, explored().texture)[(y * explored().texture.width + x) * 4]!,
    };
  }

  async function until(condition: () => boolean): Promise<void> {
    for (let frame = 0; frame < 300 && !condition(); frame++) await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(condition()).toBe(true);
  }

  it('reloads the saved mask after a context change while lighting is off', async () => {
    const { renderer, state, change, redAt } = await setup();
    await until(() => redAt(100, 100) > 250);
    change({ lighting: { ...state.lighting, enabled: false } });

    renderer.runners.contextChange.emit(renderer.gl);
    expect(redAt(100, 100)).toBe(0);
    await until(() => redAt(100, 100) > 250);
  });

  it('does not let a save scheduled before the context change write the blank memory', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { renderer, state, change, setExploredMask, redAt, loaded } = await setup();
    await until(() => redAt(100, 100) > 250);
    change({ objects: { ...state.objects, tokens: { t: visionToken(100) } } });
    change({ lighting: { ...state.lighting, enabled: false } });

    renderer.runners.contextChange.emit(renderer.gl);
    expect(redAt(100, 100)).toBe(0);
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    await loaded();
    expect(redAt(100, 100)).toBe(255);
  });

  it('holds back saves made while the reload is still under way', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { renderer, state, change, setExploredMask, redAt, loaded } = await setup({ objects: { walls: {}, lights: {}, tokens: { t: visionToken(100) } } });
    await until(() => redAt(100, 100) > 250);

    renderer.runners.contextChange.emit(renderer.gl);
    expect(redAt(100, 100)).toBe(0);
    change({ objects: { ...state.objects, tokens: { t: visionToken(120) } } });
    vi.advanceTimersByTime(SAVE_DELAY);
    expect(setExploredMask).not.toHaveBeenCalled();
    await loaded();
    expect(redAt(100, 100)).toBe(255);
  });
});
