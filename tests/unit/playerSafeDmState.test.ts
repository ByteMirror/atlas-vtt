import { describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { EventEmitter } from 'events';
import { createStore } from 'zustand/vanilla';
import { captureWithLayerVisibility, hiddenTokenLayers } from '../../src/app/pixi/playerSafeFrame';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';

describe('hiddenTokenLayers', () => {
  it('hides only the sprites of hidden tokens for the player frame and restores them', () => {
    const hidden = new Container();
    const shown = new Container();
    const tokens = { ghost: { isHidden: true }, hero: { isHidden: false } };
    const layers = hiddenTokenLayers(tokens, { ghost: hidden, hero: shown, gone: null });

    expect(layers).toEqual([{ layer: hidden, visible: false }]);
    captureWithLayerVisibility(layers, () => {}, () => {
      expect(hidden.visible).toBe(false);
      expect(shown.visible).toBe(true);
    });
    expect(hidden.visible).toBe(true);
  });
});

describe('SelectionManager.getPlayerViewLayers', () => {
  it('hides the selection overlay and marquee for the player frame', () => {
    const viewport = new Container();
    const store = createStore(() => ({ selectedIds: [], activeTool: 'select', selectionMode: 'box', objects: { tokens: {}, drawings: {} } }));
    const manager = new SelectionManager(viewport as never, () => ({}), () => ({}), store as never, new EventEmitter());
    const layers = manager.getPlayerViewLayers();

    expect(layers).toHaveLength(2);
    expect(layers.every(entry => !entry.visible && viewport.children.includes(entry.layer as Container))).toBe(true);
  });
});
