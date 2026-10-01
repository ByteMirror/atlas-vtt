import { Application, FederatedPointerEvent, Graphics, Point } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'eventemitter3';
import type { EventEmitter as NodeEventEmitter } from 'events';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ViewAtlasState } from '../../../storeFactory';
import { applyNavigationMode } from '../../viewportNavigation';
import { FogOfWarRenderer } from '../FogOfWarRenderer';

beforeEach(() => {
  vi.stubGlobal('createEl', (tag: string): HTMLElement => document.createElement(tag));
});
afterEach(() => vi.unstubAllGlobals());

it.each(['fog', 'eraser'] as const)('keeps mouse and trackpad zoom working with %s in every fog shape', async (tool) => {
  const app = new Application();
  await app.init({ width: 200, height: 200, autoStart: false });
  Object.defineProperty(app.canvas, 'win', { value: window });
  document.body.appendChild(app.canvas);
  const viewport = new Viewport({
    screenWidth: 200, screenHeight: 200, worldWidth: 200, worldHeight: 200,
    events: app.renderer.events, noTicker: true,
  });
  app.stage.addChild(viewport);
  const addFogOperation = vi.fn();
  const store = createStore<ViewAtlasState>(() => ({
    activeTool: 'move', isPlayerView: false, isGMView: true, isMapLoading: false,
    objects: { fog: {} }, addFogOperation,
  } as unknown as ViewAtlasState));
  const fog = new FogOfWarRenderer(viewport, app, new EventEmitter() as unknown as NodeEventEmitter, store);
  viewport.addChild(fog.getContainer());
  try {
    store.setState({ activeTool: tool });
    for (const shape of ['brush', 'rectangle', 'lasso'] as const) {
      fog.setFogMode(shape);
      for (const input of ['mouse', 'trackpad'] as const) {
        viewport.scale.set(1);
        viewport.position.set(0);
        applyNavigationMode(viewport, input);
        const rect = app.canvas.getBoundingClientRect();
        app.canvas.dispatchEvent(new WheelEvent('wheel', {
          clientX: rect.left + 50, clientY: rect.top + 50,
          deltaY: -100, ctrlKey: input === 'trackpad', cancelable: true,
        }));
        viewport.update(1000);
        expect(viewport.scale.x).toBeGreaterThan(1);
        expect(addFogOperation).not.toHaveBeenCalled();
      }
    }

    fog.setFogMode('brush');
    const event = new FederatedPointerEvent(app.renderer.events.rootBoundary);
    event.global = new Point(50, 50);
    viewport.emit('pointermove', event);
    const cursor = fog.getContainer().children.find((child) => child instanceof Graphics && child.zIndex === 1002)!;
    viewport.scale.set(2);
    viewport.position.set(-20, -10);
    viewport.emit('moved', { viewport, type: 'wheel' });
    expect(cursor.position.x).toBeCloseTo(35);
    expect(cursor.position.y).toBeCloseTo(30);
    expect(addFogOperation).not.toHaveBeenCalled();

    for (const shape of ['brush', 'rectangle', 'lasso'] as const) {
      fog.setFogMode(shape);
      const pointer = (x: number, y: number, button = 0): FederatedPointerEvent => {
        const result = new FederatedPointerEvent(app.renderer.events.rootBoundary);
        result.global = new Point(x, y);
        result.button = button;
        result.pointerType = 'mouse';
        return result;
      };
      addFogOperation.mockClear();
      viewport.emit('pointerdown', pointer(50, 50, 2));
      viewport.emit('pointermove', pointer(80, 80, 2));
      viewport.emit('pointerup', pointer(80, 80, 2));
      expect(addFogOperation).not.toHaveBeenCalled();
      viewport.emit('pointerdown', pointer(50, 50));
      viewport.emit('pointermove', pointer(80, 80));
      viewport.emit('pointermove', pointer(100, 60));
      viewport.emit('pointerup', pointer(100, 60));
      expect(addFogOperation).toHaveBeenCalledOnce();
      expect(addFogOperation).toHaveBeenCalledWith(expect.objectContaining({ type: shape, isErasing: tool === 'eraser' }));
    }

    store.setState({ activeTool: 'move' });
    viewport.scale.set(1);
    viewport.emit('moved', { viewport, type: 'wheel' });
    expect(cursor.visible).toBe(false);
  } finally {
    fog.destroy();
    app.destroy(true, { children: true });
  }
});
