import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { StoreApi } from 'zustand';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import { TokenResizeUI } from '../../src/app/pixi/TokenResizeUI';
import { TokenRotationUI } from '../../src/app/pixi/TokenRotationUI';
import { computeTokenPixelSize, tokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const hero: Character = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0, size: 1, rotation: 0,
  hp: { current: 5, max: 10 } };

const medium = computeTokenPixelSize(70, 1);
const gargantuan = computeTokenPixelSize(70, 2.5);

/** World-space length of `units` along `target`'s local x axis. */
function worldLength(target: Container, root: Container, units: number): number {
  return root.toLocal(target.toGlobal({ x: units, y: 0 })).x - root.toLocal(target.toGlobal({ x: 0, y: 0 })).x;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('token UI scale', () => {
  it('keeps a medium token on a 70px grid at the design size and grows linearly with the token', () => {
    expect(tokenUIScale(medium)).toBe(1);
    expect(tokenUIScale(gargantuan)).toBe(4);
  });

  it.each([medium, gargantuan])('draws the bars just below a %i px token in proportion to it', (spriteWidth) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'token-ui-scale');
    store.setState({ persistenceEnabled: false });
    const world = new Container();
    const ui = new TokenUIRenderer(store);
    try {
      world.addChild(ui.getContainer());
      ui.getContainer().position.set(500, 500);
      ui.update(hero, spriteWidth);
      const belowToken = ui.getContainer().children[0] as Container;
      const scale = spriteWidth / medium;
      // The HP bar starts 2 UI units below the token edge and is 64 UI units wide
      expect(world.toLocal(belowToken.toGlobal({ x: 0, y: 2 })).y).toBeCloseTo(500 + spriteWidth / 2 + 2 * scale, 6);
      expect(worldLength(belowToken, world, 64)).toBeCloseTo(64 * scale, 6);
    } finally { ui.destroy(); }
  });

  it('scales the +/- controls with the token they sit under', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'token-ui-scale');
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { hero } } });
    const viewport = new Container();
    const controls = new TokenControlsUI(viewport as unknown as Viewport, store);
    try {
      controls.show('hero', 100, 100, gargantuan);
      expect(controls.getContainer().position.y).toBe(100 + gargantuan / 2);
      expect(controls.getContainer().scale.x).toBe(4);
    } finally { controls.destroy(); }
  });

  it('scales resize and rotation handles with the token, including while it is resized', () => {
    // The handle icons are optional and skipped without a 2D canvas.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const state = { grid: { size: 70 }, objects: { tokens: { hero: { ...hero, size: 2.5 } } }, selectedIds: ['hero'] };
    const store = { getState: () => state } as unknown as StoreApi<ViewAtlasState>;
    const viewport = new Container();
    const tokenGroup = new Container();
    viewport.addChild(tokenGroup);
    const resizeUI = new TokenResizeUI(viewport as unknown as Viewport, store);
    const rotationUI = new TokenRotationUI(viewport as unknown as Viewport, store);
    try {
      resizeUI.showHandles(['hero'], { hero: tokenGroup });
      rotationUI.showHandles(['hero'], { hero: tokenGroup });
      const handles = [...resizeUI.getHandles(), ...rotationUI.getHandles()];
      expect(handles).toHaveLength(3);
      for (const handle of handles) expect(handle.scale.x).toBe(4);
      rotationUI.updateHandlePositions(undefined, { hero: 1 });
      expect(rotationUI.getHandles()[0]!.scale.x).toBe(1);
    } finally {
      resizeUI.destroy();
      rotationUI.destroy();
    }
  });
});
