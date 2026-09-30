import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, readRgba } from './gpuTestUtils';

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
    return { renderer, engine };
  }

  /** Renders a white map with the lighting layer on top through a camera at `scale`, offset (x, y). */
  function render(engine: LightingEngine, renderer: WebGLRenderer, scale: number, x: number, y: number): (sx: number, sy: number) => number {
    const stage = new Container();
    const map = new Sprite(Texture.WHITE);
    map.setSize(1024, 1024);
    const world = new Container();
    world.addChild(map, engine.layer);
    world.scale.set(scale);
    world.position.set(x, y);
    stage.addChild(world);
    engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    renderer.render({ container: stage, target, clear: true });
    const pixels = readRgba(renderer, target);
    world.removeChild(engine.layer);
    stage.destroy({ children: true });
    target.destroy(true);
    return (sx, sy) => pixels[(sy * SIZE + sx) * 4]!;
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
