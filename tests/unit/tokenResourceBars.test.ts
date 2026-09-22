import { afterEach, describe, expect, it, vi } from 'vitest';
import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, Graphics, Point, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import { openValueEditor } from '../../src/app/pixi/tokenValueEditor';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const hero: Character = { id: 'hero', kind: 'character', name: '', imagePath: 'hero.png', x: 0, y: 0,
  hp: { current: 1, max: 50 }, stress: 1, maxStress: 50 };

function setup() {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'resource-bars');
  store.setState({ persistenceEnabled: false, grid: { ...store.getState().grid, size: 70 },
    tokenSettings: { ...store.getState().tokenSettings, showHPBars: true, showStressBars: true },
    objects: { ...store.getState().objects, tokens: { hero } } });
  return store;
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe('resource fill geometry', () => {
  it('refreshes the secondary bar when only its maximum changes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    } as CanvasRenderingContext2D);
    const ui = new TokenUIRenderer(setup());
    try {
      ui.update(hero, 70, 1, 70);
      ui.update({ ...hero, maxStress: 100 }, 70, 1, 70);
      const labels = ui.getContainer().children.filter((c): c is Text => c instanceof Text).map(c => c.text);
      expect(labels).toContain('1/100');
    } finally { ui.destroy(); }
  });

  it.each([0, 1])('keeps the rounded leading edge at low values for resource %i', (index) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }), fillRect: vi.fn(),
    } as CanvasRenderingContext2D);
    const ui = new TokenUIRenderer(setup());
    try {
      ui.update(hero, 70, 1, 70);
      const fills = ui.getContainer().children.filter((c): c is Graphics => c instanceof Graphics && c.zIndex === 11);
      const fill = fills[index]!;
      const x = -32 + 0.375 + 1;
      const y = 35 + 2 + index * 12 + 0.375 + 1;
      const height = 10 - 0.75 - 2;
      const width = (64 - 0.75 - 2) / 50;
      expect(fill.containsPoint(new Point(x + width / 2, y + height / 2))).toBe(true);
      // Low fills must follow the track's curved cap, not turn into a vertical strip.
      expect(fill.containsPoint(new Point(x + width / 2, y + 1))).toBe(false);
      expect(fill.containsPoint(new Point(x + width + 0.1, y + height / 2))).toBe(false);
    } finally { ui.destroy(); }
  });
});

describe('resource value click editing', () => {
  it('closes once when removing the focused input triggers blur', () => {
    const anchor = document.body.createEl('canvas');
    const close = openValueEditor({ anchorEl: anchor, screenX: 0, screenY: 0,
      value: { current: 1, max: 50 }, onCommit: vi.fn() });
    const input = document.querySelector<HTMLInputElement>('.atlas-token-value-editor')!;
    const remove = input.remove.bind(input);
    const spy = vi.spyOn(input, 'remove').mockImplementation(() => {
      // Chromium sends blur while the focused node is being removed.
      if (spy.mock.calls.length === 1) input.dispatchEvent(new Event('blur'));
      remove();
    });
    close();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])('keeps input focus after a canvas click and edits resource %i', (index) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canvas = document.body.createEl('canvas');
    canvas.tabIndex = 0;
    const viewport = Object.assign(new Container(), { options: { events: { domElement: canvas } } }) as Viewport;
    const store = setup();
    const controls = new TokenControlsUI(viewport, store);
    try {
      controls.show('hero', 0, 0, 70);
      const target = controls.getContainer().children.filter(c => c.cursor === 'text')[index]!;
      const event = new FederatedPointerEvent(new EventBoundary(viewport));
      event.nativeEvent = new MouseEvent('pointerdown', { cancelable: true });
      target.emit('pointerdown', event);
      // Model the browser's default canvas focus after pointerdown listeners finish.
      if (!event.nativeEvent.defaultPrevented) canvas.focus();
      const input = document.querySelector<HTMLInputElement>('.atlas-token-value-editor');
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
      input!.value = '7/60';
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const token = store.getState().objects.tokens.hero as Character;
      if (index === 0) expect(token.hp).toEqual({ current: 7, max: 60 });
      else { expect(token.stress).toBe(7); expect(token.maxStress).toBe(60); }
      expect(document.querySelector('.atlas-token-value-editor')).toBeNull();
    } finally { controls.destroy(); viewport.destroy(); }
  });
});
