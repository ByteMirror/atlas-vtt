import { afterEach, describe, expect, it, vi } from 'vitest';
import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, Graphics, Point, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { TokenUIRenderer } from '../../src/app/pixi/TokenUIRenderer';
import { TokenControlsUI } from '../../src/app/pixi/TokenControlsUI';
import { openValueEditor } from '../../src/app/pixi/tokenValueEditor';
import { ResourceBarLabel, RESOURCE_NUMBER_GAP } from '../../src/app/pixi/ResourceBarLabel';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { barDimensions } from '../../src/app/styles/designTokens';

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
      const labels = ui.getContainer().children.flatMap(c => c.children).filter((c): c is Text => c instanceof Text && c.label === 'resource-max').map(c => c.text);
      expect(labels).toContain('100');
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

describe('resource label layout', () => {
  it('anchors both numbers against the central slash', () => {
    const label = new ResourceBarLabel();
    try {
      const [current, separator, max] = label.children as Text[];
      // Text metrics need a canvas, so check the anchoring that keeps each number flush to the slash.
      expect([current.anchor.x, current.position.x]).toEqual([1, -RESOURCE_NUMBER_GAP]);
      expect([separator.anchor.x, separator.position.x]).toEqual([0.5, 0]);
      expect([max.anchor.x, max.position.x]).toEqual([0, RESOURCE_NUMBER_GAP]);
      expect(RESOURCE_NUMBER_GAP).toBeLessThan(barDimensions.token.width / 8);
    } finally { label.destroy({ children: true }); }
  });
});

describe('resource value click editing', () => {
  it('closes once when removing the focused input triggers blur', () => {
    const anchor = document.body.createEl('canvas');
    const close = openValueEditor({ anchorEl: anchor, screenX: 0, screenY: 0,
      value: { current: 1, max: 50 }, field: 'current', resourceLabel: 'HP', onCommit: vi.fn() });
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

  it.each([{ index: 0, field: 'current' }, { index: 0, field: 'max' }, { index: 1, field: 'current' }, { index: 1, field: 'max' }] as const)('edits only $field in resource $index after clicking its number', ({ index, field }) => {
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
      event.global.copyFrom(target.toGlobal({ x: field === 'current' ? -16 : 16, y: 42 + index * 12 }));
      target.emit('pointerdown', event);
      // Model the browser's default canvas focus after pointerdown listeners finish.
      if (!event.nativeEvent.defaultPrevented) canvas.focus();
      const input = document.querySelector<HTMLInputElement>('.atlas-token-value-editor');
      expect(input).not.toBeNull();
      expect(document.activeElement).toBe(input);
      expect(input!.value).toBe(field === 'current' ? '1' : '50');
      expect(input!.getAttribute('aria-label')).toBe(`${field === 'current' ? 'Current' : 'Maximum'} ${index === 0 ? 'HP' : 'secondary resource'}`);
      input!.value = field === 'current' ? '7' : '60';
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const token = store.getState().objects.tokens.hero as Character;
      if (index === 0) {
        expect(token.hp).toEqual({ current: field === 'current' ? 7 : 1, max: field === 'max' ? 60 : 50 });
        expect(token.maxHpOverridden).toBe(field === 'max' ? true : undefined);
      } else {
        expect(token.stress).toBe(field === 'current' ? 7 : 1);
        expect(token.maxStress).toBe(field === 'max' ? 60 : 50);
        expect(token.maxStressOverridden).toBe(field === 'max' ? true : undefined);
      }
      expect(document.querySelector('.atlas-token-value-editor')).toBeNull();
    } finally { controls.destroy(); viewport.destroy(); }
  });
});
