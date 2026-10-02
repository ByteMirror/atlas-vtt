import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { describe, expect, it, vi } from 'vitest';
import type { WallSegment } from '../../../types/wallTypes';
import { KindWallLayer, type KindWall } from '../KindWallLayer';
import { kindStrokes } from '../wallKindLook';

/** A viewport of 1000 x 800 screen pixels with a ticker that runs when told to. */
function fakeViewport(zoom = 1, x = 0, y = 0): { viewport: Viewport; emit: (event: string) => void; tick: () => void; place: (zoom: number, x: number, y: number) => void } {
  const handlers = new Map<string, Set<() => void>>();
  const once = new Set<() => void>();
  const view = {
    x, y, scale: { x: zoom, y: zoom }, screenWidth: 1000, screenHeight: 800,
    on: (event: string, handler: () => void) => { handlers.set(event, (handlers.get(event) ?? new Set()).add(handler)); },
    off: (event: string, handler: () => void) => { handlers.get(event)?.delete(handler); },
    options: { ticker: { addOnce: (handler: () => void) => { once.add(handler); }, remove: (handler: () => void) => { once.delete(handler); } } },
  };
  return {
    viewport: view as unknown as Viewport,
    emit: (event) => { for (const handler of handlers.get(event) ?? []) handler(); },
    tick: () => { const due = [...once]; once.clear(); for (const handler of due) handler(); },
    place: (nextZoom, nextX, nextY) => { view.scale = { x: nextZoom, y: nextZoom }; view.x = nextX; view.y = nextY; },
  };
}

const kind = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = { blocks: 'sight' }): KindWall => ({ wall: { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra }, color: 0xaaaaaa, alpha: 1, hollow: false });

/** The layer on a visible parent, with its drawings counted and the x of every stroke's start recorded. */
function shownLayer(viewport: Viewport): { layer: KindWallLayer; draws: () => number; starts: () => number[] } {
  const layer = new KindWallLayer(viewport);
  new Container().addChild(layer.graphics);
  const clear = vi.spyOn(layer.graphics, 'clear');
  const moveTo = vi.spyOn(layer.graphics, 'moveTo');
  const circle = vi.spyOn(layer.graphics, 'circle');
  return { layer, draws: () => clear.mock.calls.length, starts: () => { const xs = [...moveTo.mock.calls.map(([x]) => x), ...circle.mock.calls.map(([x]) => x)]; moveTo.mockClear(); circle.mockClear(); return xs; } };
}

describe('the layer of walls with a look of their own', () => {
  it('draws only what is on the screen and half a screen around it', () => {
    const { viewport } = fakeViewport(1, -2000, 0);
    const { layer, starts } = shownLayer(viewport);
    // The screen shows x from 2000 to 3000: one wall on it, one far to the left, one long wall across it.
    layer.set([kind('on', 2100, 100, 2400, 100), kind('off', 100, 100, 400, 100), kind('long', 0, 300, 8000, 300, { limited: true })]);
    const xs = starts();
    expect(xs.length).toBeGreaterThan(20);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(1500 - 20);
    expect(Math.max(...xs)).toBeLessThanOrEqual(3500 + 20);
  });

  it('draws once in the frame\'s tick for all the zoom events of that frame, and not at all for a zoom that did not change', () => {
    const { viewport, emit, tick, place } = fakeViewport();
    const { layer, draws } = shownLayer(viewport);
    layer.set([kind('a', 100, 100, 400, 100)]);
    expect(draws()).toBe(1);
    emit('zoomed');
    tick();
    expect(draws()).toBe(1);
    place(1.1, 0, 0);
    emit('zoomed');
    place(1.2, 0, 0);
    emit('zoomed');
    place(1.3, 0, 0);
    emit('zoomed');
    expect(draws()).toBe(1);
    tick();
    expect(draws()).toBe(2);
    tick();
    expect(draws()).toBe(2);
  });

  it('draws nothing anew for a pan within what it drew, and draws again once the screen leaves it', () => {
    const { viewport, emit, tick, place } = fakeViewport();
    const { layer, draws } = shownLayer(viewport);
    layer.set([kind('a', 100, 100, 400, 100)]);
    place(1, -300, -200);
    emit('moved');
    tick();
    expect(draws()).toBe(1);
    place(1, -900, 0);
    emit('moved');
    tick();
    expect(draws()).toBe(2);
  });

  it('draws nothing while its parent is hidden, and nothing after it is destroyed', () => {
    const { viewport, emit, tick, place } = fakeViewport();
    const { layer, draws } = shownLayer(viewport);
    layer.set([kind('a', 100, 100, 400, 100)]);
    layer.graphics.parent!.visible = false;
    place(2, 0, 0);
    emit('zoomed');
    tick();
    expect(draws()).toBe(1);
    layer.graphics.parent!.visible = true;
    place(3, 0, 0);
    emit('zoomed');
    layer.destroy();
    tick();
    emit('zoomed');
    expect(draws()).toBe(1);
  });

  it('makes every pattern coarser alike where the screen holds more strokes and dots than it lays out', () => {
    const { viewport } = fakeViewport(1, 0, 0);
    const { layer, starts } = shownLayer(viewport);
    // 4,000 limited walls across the screen: far more than a million dots at their own size.
    layer.set(Array.from({ length: 4000 }, (_, i) => kind(`w${i}`, 0, i / 5, 1000, i / 5, { limited: true })));
    expect(starts().length).toBeLessThan(40_000);
  });

  it('keeps the pattern where it is on the wall whatever part of it is drawn', () => {
    const whole = kindStrokes(4000, 1, 'sight');
    const part = kindStrokes(4000, 1, 'sight', { from: 1503, to: 2210, coarsen: 1 });
    expect(part.length).toBeGreaterThan(30);
    expect(part.length).toBeLessThan(45);
    for (const stroke of part) expect(whole).toContainEqual(stroke);
    expect(part[0]![1]).toBeGreaterThan(1503);
    expect(part[part.length - 1]![0]).toBeLessThan(2210);
  });
});
