import { afterEach, describe, expect, it } from 'vitest';
import { Container, type Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';
import type { TokenEntity } from '../../src/app/types';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restore: (() => void) | undefined;
afterEach(() => { restore?.(); restore = undefined; });

function setup(tokens: Record<string, TokenEntity>, lighting: Partial<SceneLighting> = {}): { fallback: CanvasLightingFallback; viewport: Container } {
  restore = stubJsdomGraphics();
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `canvas-lighting-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  store.getState().setSceneLighting({ enabled: true, ...lighting });
  const viewport = new Container();
  const fallback = new CanvasLightingFallback({
    viewport: viewport as unknown as Viewport,
    store,
    measurement: () => ({ mode: 'grid', unitType: 'feet', unitDistance: 5, diagonalRule: 'chebyshev', rangeBands: [] }) as never,
    bounds: () => ({ width: 1000, height: 1000 }),
  });
  return { fallback, viewport };
}

const hero: TokenEntity = { id: 'hero', kind: 'token', imagePath: 'h.png', x: 100, y: 100, vision: { enabled: true, range: 10 } };

describe('CanvasLightingFallback', () => {
  it('blacks out the map outside sight in the player frame only', () => {
    const { fallback, viewport } = setup({ hero });
    const darkness = viewport.children[0]!;
    expect(darkness.visible).toBe(false);
    fallback.modeLayer.visible = true;
    expect(darkness.visible).toBe(true);
    expect(fallback.currentSight().all).toBe(false);
    fallback.modeLayer.visible = false;
    expect(darkness.visible).toBe(false);
  });

  it('hides nothing while no token has vision', () => {
    const { fallback } = setup({});
    expect(fallback.currentSight().all).toBe(true);
  });

  it('hides nothing by line of sight while the scene switches token vision off', () => {
    const { fallback, viewport } = setup({ hero }, { tokenVision: false });
    expect(fallback.currentSight().all).toBe(true);
    fallback.modeLayer.visible = true;
    expect((viewport.children[0] as Graphics).context.instructions).toHaveLength(0);
  });

  it('counts everything in sight as lit, whatever the scene\'s threshold, since it draws no light', () => {
    const { fallback } = setup({ hero }, { ambient: 0, litThreshold: 1 });
    const { ambient, litThreshold } = fallback.ambientLight();
    expect(ambient).toBeGreaterThanOrEqual(litThreshold ?? 0.25);
  });
});
