import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Container, EventBoundary, FederatedPointerEvent, Rectangle, Text, loadEnvironmentExtensions, updateRenderGroupTransforms } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { ResourceBarHitArea } from '../../src/app/pixi/ResourceBarHitArea';
import { resourceUpdates, tokenHp, tokenStress, visibleResourceBars } from '../../src/app/pixi/token-renderer/tokenResources';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { barDimensions } from '../../src/app/styles/designTokens';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const both = { showHPBars: true, showStressBars: true };

describe('token resources', () => {
  it('reads every stored form the way the bars show it', () => {
    expect(tokenHp({ hp: 100 })).toEqual({ current: 100, max: 100 });
    expect(tokenHp({ hp: { current: 5, max: 20 } })).toEqual({ current: 5, max: 20 });
    expect(tokenStress({ stress: 0 })).toEqual({ current: 0, max: 10 });
    expect(tokenStress({ stress: 2, maxStress: 6 })).toEqual({ current: 2, max: 6 });
    expect(tokenStress({ stress: { current: 1, max: 4 } })).toEqual({ current: 1, max: 4 });
    expect(tokenHp({})).toBeNull();
  });

  it('lists the visible bars top to bottom', () => {
    const token = { hp: 30, stress: 1 };
    expect(visibleResourceBars(token, both).map((bar) => bar.kind)).toEqual(['hp', 'stress']);
    expect(visibleResourceBars(token, { showHPBars: false, showStressBars: true }).map((bar) => bar.kind)).toEqual(['stress']);
  });

  it('writes edits back in the stored form and marks new maximums', () => {
    expect(resourceUpdates({ hp: 100 }, 'hp', { current: 100, max: 100 }, { current: 90, max: 100 })).toEqual({ hp: { current: 90, max: 100 } });
    expect(resourceUpdates({ stress: 0 }, 'stress', { current: 0, max: 10 }, { current: 3, max: 12 }))
      .toEqual({ stress: 3, maxStress: 12, maxStressOverridden: true });
    expect(resourceUpdates({ stress: { current: 1, max: 4 } }, 'stress', { current: 1, max: 4 }, { current: 2, max: 4 }))
      .toEqual({ stress: { current: 2, max: 4 } });
  });
});

describe('resource bar controls', () => {
  beforeAll(async () => {
    // Pixi installs the pointer-event mixin lazily with the browser environment, which a renderer normally triggers.
    await loadEnvironmentExtensions(false);
  });

  function mount(hero: Partial<Character>, settings = both) {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canvas = document.body.createEl('canvas');
    const viewport = Object.assign(new Container(), { options: { events: { domElement: canvas } } }) as Viewport;
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `resource-controls-${Math.random()}`);
    const token = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0, ...hero } as Character;
    store.setState({ persistenceEnabled: false, tokenSettings: { ...store.getState().tokenSettings, ...settings },
      objects: { ...store.getState().objects, tokens: { hero: token } } });
    const controls = new TokenControlsUI(viewport, store);
    controls.show('hero', 0, 0, 70, 1);
    const [hpHit, stressHit] = controls.getContainer().children.filter((c): c is ResourceBarHitArea => c instanceof ResourceBarHitArea);
    const barTop = (hit: ResourceBarHitArea): number => (hit as unknown as { barTop: number }).barTop;
    const open = (hit: ResourceBarHitArea): void => {
      const event = new FederatedPointerEvent(new EventBoundary(viewport));
      event.nativeEvent = new MouseEvent('pointerdown', { cancelable: true });
      hit.emit('pointerdown', event);
    };
    const commit = (value: string): void => {
      const input = document.querySelector<HTMLInputElement>('.atlas-token-value-editor__input')!;
      input.value = value;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    };
    const stored = (): Character => store.getState().objects.tokens.hero as Character;
    return { controls, viewport, hpHit: hpHit!, stressHit: stressHit!, barTop, open, commit, stored };
  }

  it('edits hit points stored as a bare number', () => {
    const { controls, viewport, hpHit, open, commit, stored } = mount({ hp: 100 });
    try {
      expect(hpHit.visible).toBe(true);
      open(hpHit);
      commit('80');
      expect(stored().hp).toEqual({ current: 80, max: 100 });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('edits a secondary resource stored without a maximum', () => {
    const { controls, viewport, stressHit, open, commit, stored } = mount({ hp: { current: 5, max: 5 }, stress: 0 });
    try {
      expect(stressHit.visible).toBe(true);
      open(stressHit);
      commit('4');
      expect(stored()).toMatchObject({ stress: 4, maxStress: 10 });
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('puts the secondary overlay on the top bar when hit point bars are hidden', () => {
    const { controls, viewport, hpHit, stressHit, barTop } = mount({ hp: { current: 5, max: 5 }, stress: 1, maxStress: 4 }, { showHPBars: false, showStressBars: true });
    try {
      expect(hpHit.visible).toBe(false);
      expect(stressHit.visible).toBe(true);
      expect(barTop(stressHit)).toBe(2);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('stacks the overlays like the bars when both show', () => {
    const { controls, viewport, hpHit, stressHit, barTop } = mount({ hp: { current: 5, max: 5 }, stress: 1, maxStress: 4 });
    try {
      expect(barTop(hpHit)).toBe(2);
      expect(barTop(stressHit)).toBe(2 + barDimensions.token.height + barDimensions.token.gap);
    } finally { controls.destroy(); viewport.destroy(); }
  });

  it('routes pointer hits on each drawn bar to that bar\'s overlay', () => {
    const { controls, viewport, hpHit, stressHit, barTop } = mount({ hp: 100, stress: 0 });
    const stage = new Container({ isRenderGroup: true });
    try {
      viewport.eventMode = 'static';
      viewport.hitArea = new Rectangle(-1000, -1000, 2000, 2000);
      stage.addChild(viewport);
      controls.setScaleFor('hero', 1.5);
      updateRenderGroupTransforms(stage.renderGroup!, true);
      // Token of 70px centred at the origin: the bars hang from its bottom edge at the controls' scale.
      const hitBarCentre = (hit: ResourceBarHitArea): Container | null =>
        new EventBoundary(stage).hitTest(0, 35 + 1.5 * (barTop(hit) + barDimensions.token.height / 2));
      expect(hitBarCentre(hpHit)).toBe(hpHit);
      expect(hitBarCentre(stressHit)).toBe(stressHit);
    } finally { controls.destroy(); stage.destroy({ children: true }); }
  });
});

describe('conditions card', () => {
  it('shows on a plain hover only, not while the token is selected or held', () => {
    restoreGraphics = stubJsdomGraphics();
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue({ width: 80, height: 20 } as never);
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `conditions-card-${Math.random()}`);
    const ui = new TokenUIRenderer(store);
    ui.conditionDefsProvider = () => [{ id: 'prone', name: 'Prone', color: '#8e44ad' }];
    const card = (): boolean =>
      (ui as unknown as { conditionUI: { card: { container: { visible: boolean } } } }).conditionUI.card.container.visible;
    try {
      ui.update({ id: 'a', kind: 'character', name: 'A', imagePath: '', x: 0, y: 0, conditions: ['prone'] } as Character, 62);
      ui.setHoverState(true);
      expect(card()).toBe(true);
      ui.setHeld(true);
      expect(card()).toBe(false);
      ui.setHeld(false);
      ui.setSelectionState(true);
      expect(card()).toBe(false);
      ui.setSelectionState(false);
      ui.setHoverState(true, true);
      expect(card()).toBe(false);
    } finally {
      ui.destroy();
    }
  });
});
