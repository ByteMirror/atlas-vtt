import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { srgbToLinear } from '../../../../lighting/srgb';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, readRgba } from './gpuTestUtils';

const SIZE = 256;
const SCALE = 4;
const TEXEL = 2;
/** The camera looks at the middle of the room's north wall, whose centre line is y = 100. */
const CENTRE = { x: 300, y: 100 };

function wall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

const room = [wall('n', 100, 100, 500, 100), wall('e', 500, 100, 500, 500), wall('s', 500, 500, 100, 500), wall('w', 100, 500, 100, 100)];
const light: EngineLight = { key: 'l', x: 300, y: 450, bright: 400, dim: 800, flame: 10, color: [1, 1, 1], intensity: 0.8, animation: 'none' };

function scene(overrides: Partial<EngineScene>): EngineScene {
  return { bounds: { width: 1024, height: 1024 }, albedo: null, walls: room, lights: [light], sight: SEES_ALL, sightRadius: 20, ambient: 0, ...overrides };
}

describe('wall faces', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(): Promise<{ renderer: WebGLRenderer; engine: LightingEngine }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    return { renderer, engine };
  }

  /** Renders a white map under the lighting layer at `SCALE` around `CENTRE`; reads the red channel at a world point. */
  function render(engine: LightingEngine, renderer: WebGLRenderer): (x: number, y: number) => number {
    const ox = SIZE / 2 - CENTRE.x * SCALE, oy = SIZE / 2 - CENTRE.y * SCALE;
    const stage = new Container();
    const map = new Sprite(Texture.WHITE);
    map.setSize(1024, 1024);
    const world = new Container();
    world.addChild(map, engine.layer);
    world.scale.set(SCALE);
    world.position.set(ox, oy);
    stage.addChild(world);
    engine.setView(new Matrix(SCALE, 0, 0, SCALE, ox, oy).invert(), SCALE);
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    renderer.render({ container: stage, target, clear: true });
    const pixels = readRgba(renderer, target);
    world.removeChild(engine.layer);
    stage.destroy({ children: true });
    target.destroy(true);
    return (x, y) => pixels[(Math.floor(y * SCALE + oy) * SIZE + Math.floor(x * SCALE + ox)) * 4]!;
  }

  it('lights the face of a wall on the lit side and leaves its far side dark', async () => {
    const { renderer, engine } = await setup();
    engine.update(scene({}));
    engine.flush();
    const at = render(engine, renderer);
    // Below the tonemap's shoulder PBR Neutral only subtracts 0.04 from linear light.
    const light = (x: number, y: number): number => srgbToLinear(at(x, y) / 255) + 0.04;
    for (const x of [250, 300, 350]) {
      expect(light(x, CENTRE.y + 2 * TEXEL)).toBeGreaterThanOrEqual(0.9 * light(x, CENTRE.y + 2 * TEXEL + 12));
      expect(at(x, CENTRE.y - 2 * TEXEL)).toBe(0);
    }
  });

  it('reveals no sight past a wall beyond its core', async () => {
    const { renderer, engine } = await setup();
    const sight = computeSight([{ tokenId: 't', origin: { x: 300, y: 300 }, range: 4000, darkvision: 0 }], room);
    engine.update(scene({ lights: [], ambient: 1, sight }));
    engine.flush();
    const at = render(engine, renderer);
    const core = 1.5 * TEXEL + 1.5 / SCALE;
    for (const x of [250, 300, 350]) {
      expect(at(x, CENTRE.y + 2 * TEXEL)).toBeGreaterThan(200);
      for (let d = core + 0.5; d < 12; d += 1 / SCALE) expect(at(x, CENTRE.y - d)).toBe(0);
    }
  });
});
