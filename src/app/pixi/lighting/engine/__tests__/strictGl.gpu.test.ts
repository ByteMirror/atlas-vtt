import { Container, Graphics, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { sealTolerance, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL, computeSight, type SenseSource, type Sight, type SightSource } from '../../../../vision/sight';
import { visionCone } from '../../../../vision/visionCone';
import { resetContext } from '../../__tests__/rendererHarness';
import { ExploredTexture } from '../../ExploredTexture';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { fuzzRooms } from './fuzzRooms';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { watchGl, type GlWatch } from './strictGl';
import { darkvision, senseSource } from '../../../../vision/__tests__/senseSources';
import { BUILT_IN_SENSES } from '../../../../gameSystems/senses';
import type { SenseDefinition } from '../../../../types/senseTypes';

const SIZE = 256;
const MAP = 1024;
const camera = { size: SIZE, scale: SIZE / MAP, x: 0, y: 0 };

function light(key: string, x: number, y: number, animation: EngineLight['animation'] = 'none'): EngineLight {
  return { key, x, y, bright: 60, dim: 160, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation };
}

function wall(id: string, x1: number, y1: number, x2: number, y2: number, direction?: 'left' | 'right'): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...(direction ? { direction } : {}) };
}

function scene(overrides: Partial<EngineScene> = {}): EngineScene {
  return { bounds: { width: MAP, height: MAP }, albedo: null, walls: [], lights: [light('a', 300, 300)], sight: SEES_ALL, sightRadius: 20, ambient: 0.05, ...overrides };
}

/** Walls 1..n of a comb left of x = 600, the first `oneWay` of them one-way. */
function comb(n: number, oneWay = 0): WallSegment[] {
  return Array.from({ length: n }, (_, i) => wall(`w${i}`, 400 + i * 40, 150, 400 + i * 40, 450, i < oneWay ? 'left' : undefined));
}

function senseOf(id: string): SenseDefinition {
  return Object.values(BUILT_IN_SENSES).flat().find((sense) => sense.id === id)!;
}

function sightOf(walls: readonly WallSegment[], cone = false): Sight {
  const facing = cone ? visionCone(40, 90, 20) : undefined;
  const first: SightSource = { tokenId: 't', origin: { x: 320, y: 320 }, range: 400, senses: [darkvision(150)], ...(facing ? { cone: facing } : {}) };
  return computeSight([first, { tokenId: 'u', origin: { x: 700, y: 640 }, range: 250, senses: [] }], walls);
}

describe('strict GL: every uniform and draw of the lighting engine is valid', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  interface Setup {
    renderer: WebGLRenderer;
    engine: LightingEngine;
    watch: GlWatch;
    /** Renders the player's and the GM's view through the composite. */
    shoot: () => void;
  }

  async function setup(resolution = 1, antialias = false): Promise<Setup> {
    const renderer = await createTestRenderer(SIZE, resolution, antialias);
    cleanup.push(() => renderer.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    const shoot = (): void => {
      for (const mode of ['player', 'gm'] as const) {
        engine.setMode(mode);
        renderThroughEngine(engine, renderer, camera);
      }
    };
    return { renderer, engine, watch, shoot };
  }

  function expectClean(watch: GlWatch): void {
    expect(watch.findings).toEqual([]);
    expect(watch.draws()).toBeGreaterThan(0);
    expect(watch.uniforms()).toBeGreaterThan(0);
  }

  it('through the leak fuzz rooms, lit and seen', async () => {
    const { engine, watch, shoot } = await setup();
    const bounds = { width: 2048, height: 2048 };
    for (const room of fuzzRooms(11, 6)) {
      const walls = sealWalls(room.walls, sealTolerance(worldTexel(bounds)));
      const lights = room.lights.map(([x, y], i) => light(`l${i}`, x, y));
      engine.update({ bounds, albedo: null, walls, lights, sight: SEES_ALL, sightRadius: 30, ambient: 0 });
      engine.flush();
      shoot();
      const sources = lights.map((l) => ({ tokenId: l.key, origin: { x: l.x, y: l.y }, range: 4000, senses: [] }));
      engine.update({ bounds, albedo: null, walls, lights: [], sight: computeSight(sources, walls), sightRadius: 30, ambient: 1 });
      engine.flush();
      shoot();
    }
    expectClean(watch);
  });

  it('while lights are added, moved, removed and flicker', async () => {
    const { engine, watch, shoot } = await setup();
    const walls = comb(3);
    const steps: EngineLight[][] = [
      [],
      [light('a', 300, 300)],
      [light('a', 300, 300), light('b', 700, 600, 'torch'), light('c', 520, 800, 'pulse')],
      [light('a', 340, 280), light('b', 700, 600, 'torch'), light('c', 520, 800, 'pulse')],
      [light('c', 520, 800, 'candle')],
      [],
    ];
    for (const lights of steps) {
      engine.update(scene({ walls, lights }));
      engine.flush();
      for (let frame = 0; frame < 3; frame++) engine.animate(performance.now() + frame * 200);
      shoot();
    }
    expectClean(watch);
  });

  it('while walls grow and shrink between builds and one-way walls come and go', async () => {
    const { engine, watch, shoot } = await setup();
    const steps: WallSegment[][] = [[], comb(1), comb(2), comb(5), comb(5, 1), comb(5, 3), comb(2, 2), comb(1, 1), comb(1), comb(4), []];
    for (const walls of steps) {
      engine.update(scene({ walls, lights: [light('a', 300, 300), light('b', 700, 300)], sight: sightOf(walls) }));
      engine.flush();
      shoot();
    }
    expectClean(watch);
  });

  it('with every way a sense is drawn: grey, black and white, heat, colour, dim as bright, under dim ambient light', async () => {
    const { engine, watch, shoot } = await setup();
    const walls = comb(3);
    const looks: SenseSource[][] = [
      [senseSource('blindsight', 300), senseSource('low-light-vision', 4000)],
      [darkvision(200), senseSource('truesight', 250)],
      [{ definition: senseOf('pathfinder2e-greater-darkvision'), range: 4000 }],
      [{ definition: senseOf('ose-infravision'), range: 300 }, { definition: senseOf('dnd5e-darkvision'), range: 200 }],
    ];
    for (const senses of looks) {
      for (const ambient of [0, 0.5]) {
        const sight = computeSight([{ tokenId: 't', origin: { x: 320, y: 320 }, range: 400, senses }, { tokenId: 'u', origin: { x: 700, y: 640 }, range: 250, senses: [], blinded: true }], walls);
        engine.update(scene({ walls, sight, ambient }));
        engine.flush();
        shoot();
      }
    }
    expectClean(watch);
  });

  it('with no walls, no lights and no vision token', async () => {
    const { engine, watch, shoot } = await setup();
    engine.update(scene({ lights: [], ambient: 0 }));
    engine.flush();
    shoot();
    expectClean(watch);
  });

  it('with a vision cone, darkvision and the map image as albedo', async () => {
    const { renderer, engine, watch, shoot } = await setup();
    const albedo = RenderTexture.create({ width: 64, height: 64 });
    cleanup.push(() => albedo.destroy(true));
    const paint = new Graphics().rect(0, 0, 64, 64).fill({ color: 0x8866aa });
    renderer.render({ container: paint, target: albedo, clear: true });
    paint.destroy();
    const walls = comb(4, 1);
    for (const cone of [false, true]) {
      engine.update(scene({ walls, albedo, sight: sightOf(walls, cone) }));
      engine.flush();
      shoot();
    }
    expectClean(watch);
  });

  it('while explored memory is stamped and shown', async () => {
    const { renderer, engine, watch, shoot } = await setup();
    const explored = new ExploredTexture(renderer, { width: MAP, height: MAP });
    cleanup.push(() => explored.destroy());
    engine.setExplored(explored.texture);
    const walls = comb(3);
    const sight = sightOf(walls);
    engine.update(scene({ walls, sight, exploredColor: '#ffcc99', unexploredColor: '#112233' }));
    engine.flush();
    const seen = sight.regions.flatMap((region) => (region.polygon ? [region.polygon] : []));
    explored.add({ polygons: seen, clip: null });
    explored.add({ polygons: [[{ x: 600, y: 600 }, { x: 900, y: 620 }, { x: 760, y: 900 }]], clip: seen });
    shoot();
    engine.update(scene({ walls, sight, exploredMemory: false }));
    shoot();
    expectClean(watch);
  });

  it.each([1, 2])('on the canvas through the back buffer at resolution %i, with lighting switched off and on', async (resolution) => {
    const { renderer, engine, watch } = await setup(resolution, true);
    const stage = new Container();
    const world = new Container();
    const map = new Sprite(Texture.WHITE);
    map.setSize(MAP, MAP);
    world.addChild(map, engine.layer);
    world.scale.set(camera.scale);
    stage.addChild(world);
    cleanup.push(() => { world.removeChild(engine.layer); stage.destroy({ children: true }); });
    engine.setView(new Matrix(camera.scale, 0, 0, camera.scale, 0, 0).invert(), camera.scale);
    const walls = comb(3, 1);
    const lit = scene({ walls, sight: sightOf(walls) });
    for (const mode of ['gm', 'player'] as const) {
      engine.setMode(mode);
      engine.update(lit);
      engine.flush();
      renderer.render({ container: stage });
      engine.setEnabled(false);
      renderer.render({ container: stage });
      engine.setEnabled(true);
      engine.update(lit);
      engine.flush();
      renderer.render({ container: stage });
    }
    expectClean(watch);
  });

  it('across a lost and restored context', async () => {
    const { renderer, engine, watch, shoot } = await setup();
    const walls = comb(3, 1);
    const lit = scene({ walls, sight: sightOf(walls), lights: [light('a', 300, 300), light('b', 700, 300, 'torch')] });
    engine.update(lit);
    engine.flush();
    shoot();
    await resetContext(renderer, () => {
      engine.update(scene({ walls: comb(4), sight: sightOf(comb(4)) }));
      engine.animate(performance.now());
    });
    engine.update(lit);
    engine.flush();
    engine.animate(performance.now() + 500);
    shoot();
    expectClean(watch);
  });
});
