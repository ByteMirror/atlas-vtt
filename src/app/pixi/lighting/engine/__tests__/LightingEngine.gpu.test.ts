import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import { LightingWorld } from '../LightingWorld';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';

const SIZE = 256;
const light: EngineLight = { key: 'l', x: 300, y: 300, bright: 60, dim: 120, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'none' };

function scene(overrides: Partial<EngineScene> = {}): EngineScene {
  return { bounds: { width: 1024, height: 1024 }, albedo: null, walls: [], lights: [light], sight: SEES_ALL, sightRadius: 20, ambient: 0, ...overrides };
}

function wall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

/**
 * A closed room from 100 to 500 around the light. Bounce spreads past the light's reach (spread
 * 250 px): on an open map it still lights the floor 345 px away (3/255, 0 with bounce off), so
 * only walls make "black far away" exact.
 */
const room = [wall('n', 100, 100, 500, 100), wall('e', 500, 100, 500, 500), wall('s', 500, 500, 100, 500), wall('w', 100, 500, 100, 100)];

function oneWayWall(x: number): WallSegment {
  return { id: `w${x}`, kind: 'wall', type: 'solid', p1: { x, y: 100 }, p2: { x, y: 500 }, direction: 'left' };
}

describe('LightingEngine', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(): Promise<{ renderer: WebGLRenderer; engine: LightingEngine }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    return { renderer, engine };
  }

  /** The red channel of a white map lit through a camera at `scale`, offset (x, y). */
  function render(engine: LightingEngine, renderer: WebGLRenderer, scale: number, x: number, y: number): (sx: number, sy: number) => number {
    const at = renderThroughEngine(engine, renderer, { size: SIZE, scale, x, y });
    return (sx, sy) => at(sx, sy)[0];
  }

  it('lights around the light, black outside its room, in player mode with everything seen', async () => {
    const { renderer, engine } = await setup();
    engine.setMode('player');
    engine.update(scene({ walls: room }));
    engine.flush();
    const at = render(engine, renderer, 0.5, -22, -22);
    expect(at(128, 128)).toBeGreaterThan(150);
    expect(at(250, 250)).toBe(0);
  });

  it("follows each render's own camera (player window)", async () => {
    const { renderer, engine } = await setup();
    engine.setMode('player');
    engine.update(scene({ walls: room }));
    engine.flush();
    const a = render(engine, renderer, 0.5, -22, -22);
    const b = render(engine, renderer, 0.5, -122, -22);
    expect(a(128, 128)).toBeGreaterThan(150);
    expect(b(28, 128)).toBeGreaterThan(150);
    // World (560, 300): outside the room.
    expect(b(158, 128)).toBe(0);
  });

  it('lights the right place when the map starts inside the screen', async () => {
    const { renderer, engine } = await setup();
    engine.setMode('player');
    engine.update(scene({ walls: room }));
    engine.flush();
    // The layer's filter area starts at (100, 60), not at the screen's corner.
    const at = render(engine, renderer, 0.25, 100, 60);
    expect(at(175, 135)).toBeGreaterThan(150);
    expect(at(250, 250)).toBe(0);
  });

  it('shows the GM a ghosted map where there is no light', async () => {
    const { renderer, engine } = await setup();
    engine.setMode('gm');
    engine.update(scene({ lights: [] }));
    engine.flush();
    const at = render(engine, renderer, 0.25, 0, 0);
    expect(at(128, 128)).toBeGreaterThan(0);
  });

  it('leaves the back buffer off while disabled, however often it updates', async () => {
    const { renderer, engine } = await setup();
    engine.setEnabled(false);
    expect(engine.layer.visible).toBe(false);
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    engine.update(scene({ walls: room }));
    engine.update(scene({ bounds: { width: 512, height: 512 } }));
    engine.flush();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
    engine.setEnabled(true);
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    expect(engine.layer.visible).toBe(true);
  });

  it('rebuilds its world from the last scene when the WebGL context is restored', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const restored = vi.fn();
    const engine = new LightingEngine(renderer, restored);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update(scene({ walls: room }));
    engine.flush();
    expect(render(engine, renderer, 0.5, -22, -22)(128, 128)).toBeGreaterThan(150);
    // PIXI's systems forget every GL object, as after a real restore: render textures come back blank.
    renderer.runners.contextChange.emit(renderer.gl);
    expect(restored).toHaveBeenCalledOnce();
    engine.flush();
    expect(render(engine, renderer, 0.5, -22, -22)(128, 128)).toBeGreaterThan(150);
  });

  it('reports a restored context while lighting is off, with no world to rebuild', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const restored = vi.fn();
    const engine = new LightingEngine(renderer, restored);
    cleanup.push(() => engine.destroy());
    renderer.runners.contextChange.emit(renderer.gl);
    expect(restored).toHaveBeenCalledTimes(1);

    engine.setEnabled(true);
    engine.update(scene({ walls: room }));
    engine.setEnabled(false);
    renderer.runners.contextChange.emit(renderer.gl);
    expect(restored).toHaveBeenCalledTimes(2);
    expect(engine.busy()).toBe(false);
    expect(engine.layer.filters).toBeNull();
  });

  it('frees its world while disabled and rebuilds it on the next enabled update', async () => {
    const { renderer, engine } = await setup();
    const destroyWorld = vi.spyOn(LightingWorld.prototype, 'destroy');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    engine.setMode('player');
    engine.update(scene({ walls: room }));
    engine.flush();
    engine.setEnabled(false);
    expect(destroyWorld).toHaveBeenCalledOnce();
    expect(engine.busy()).toBe(false);
    engine.setEnabled(true);
    engine.update(scene({ walls: room }));
    engine.flush();
    const at = render(engine, renderer, 0.5, -22, -22);
    expect(at(128, 128)).toBeGreaterThan(150);
    expect(at(250, 250)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns the back buffer off on destroy only if it turned it on', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const never = new LightingEngine(renderer);
    renderer.backBuffer.useBackBuffer = true;
    never.destroy();
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    renderer.backBuffer.useBackBuffer = false;
    const enabled = new LightingEngine(renderer);
    enabled.setEnabled(true);
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    enabled.destroy();
    expect(renderer.backBuffer.useBackBuffer).toBe(false);
  });

  it('keeps no destroyed texture bound when one-way walls come and go or the map changes', async () => {
    const { renderer, engine } = await setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    engine.setMode('player');
    engine.update(scene({ walls: [oneWayWall(600)] }));
    engine.flush();
    render(engine, renderer, 0.5, -22, -22);
    engine.update(scene());
    engine.flush();
    render(engine, renderer, 0.5, -22, -22);
    engine.update(scene({ bounds: { width: 512, height: 512 } }));
    engine.flush();
    const at = render(engine, renderer, 0.5, -22, -22);
    expect(warn).not.toHaveBeenCalled();
    expect(at(128, 128)).toBeGreaterThan(150);
  });
});
