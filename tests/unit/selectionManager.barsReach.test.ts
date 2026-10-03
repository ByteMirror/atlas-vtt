import { EventEmitter } from 'events';
import { expect, it } from 'vitest';
import { Container, Sprite, type Graphics } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { SelectionManager } from '../../src/app/pixi/SelectionManager';

it('draws the selection frame around the token and the bars below it, not around its wheels', () => {
  const group = new Container();
  const sprite = group.addChild(new Sprite());
  sprite.width = 70;
  sprite.height = 70;
  group.position.set(100, 100);
  const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }) => point });
  const store = createStore(subscribeWithSelector(() => ({
    selectedIds: ['goblin'], activeTool: 'select', selectionMode: 'box',
    objects: { tokens: { goblin: { id: 'goblin' } }, drawings: {} },
  })));
  const manager = new SelectionManager(viewport as never, () => ({ goblin: group }), () => ({}), store as never, new EventEmitter());
  manager.barsReachProvider = () => 24;

  manager.updateSelectionOverlay();

  const { minX, maxX, minY, maxY } = (manager.getPlayerViewLayers()[0]!.layer as Graphics).bounds;
  // The frame's padding and glow, the same on every side
  const margin = 100 - 35 - minX;
  expect(margin).toBeGreaterThan(0);
  expect(margin).toBeLessThan(20);
  expect(maxX).toBeCloseTo(100 + 35 + margin);
  expect(minY).toBeCloseTo(100 - 35 - margin);
  expect(maxY).toBeCloseTo(100 + 35 + 24 + margin);
});
