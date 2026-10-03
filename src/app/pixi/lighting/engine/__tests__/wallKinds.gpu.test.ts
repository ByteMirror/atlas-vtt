import { Graphics, RenderTexture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { worldTexel } from '../../../../lighting/lightingConstants';
import { sealedWalls } from '../../../../lighting/sealWalls';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL, computeSight, type Sight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine, type PixelReader } from './gpuTestUtils';
import { NO_SIGHT } from './leakFuzzScene';
import { watchGl } from './strictGl';

const SIZE = 512;
const MAP = 1024;
/** The middle of the map, one screen pixel for one world pixel. */
const camera = { size: SIZE, scale: 1, x: -256, y: -256 };
const bounds = { width: MAP, height: MAP };
/** A wall across the whole map at x = 512, between the torch and what lies east of it. */
const across = (kind: Partial<WallSegment>): WallSegment[] => [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 512, y: 0 }, p2: { x: 512, y: MAP }, ...kind }];
const torch: EngineLight = { key: 'torch', x: 400, y: 512, bright: 150, dim: 300, flame: 12, color: [1, 0.85, 0.6], intensity: 1, animation: 'none' };
const KINDS: Record<string, WallSegment[]> = { none: [], solid: across({}), curtain: across({ blocks: 'sight' }), glass: across({ blocks: 'light' }), door: across({ blocks: 'sight', type: 'door', closed: true }) };
const sum = ([r, g, b]: readonly number[]): number => r! + g! + b!;

describe('walls that block one thing, in the picture', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The players' picture of the scene with each kind of wall across it, read at world points. */
  async function pictures(scene: (walls: readonly WallSegment[]) => Partial<EngineScene>, explored?: (renderer: Awaited<ReturnType<typeof createTestRenderer>>) => RenderTexture): Promise<Record<string, (x: number, y: number) => number>> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    engine.setEnabled(true);
    engine.setMode('player');
    if (explored) {
      const memory = explored(renderer);
      cleanup.push(() => memory.destroy(true));
      engine.setExplored(memory);
    }
    const out: Record<string, (x: number, y: number) => number> = {};
    for (const [name, drawn] of Object.entries(KINDS)) {
      const walls = sealedWalls(drawn, worldTexel(bounds));
      engine.update({ bounds, albedo: null, walls, lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 0, ...scene(walls) });
      engine.flush();
      const read: PixelReader = renderThroughEngine(engine, renderer, camera);
      out[name] = (x, y) => sum(read(Math.floor(x) + camera.x, Math.floor(y) + camera.y));
    }
    // Every pass, the second field among them, is valid under the strict context.
    expect(watch.findings).toEqual([]);
    expect(engine.failed).toBe(false);
    return out;
  }

  /** Every point of a grid over the view where two pictures are more than `apart` apart. */
  function differences(a: (x: number, y: number) => number, b: (x: number, y: number) => number, apart = 6): [number, number, number, number][] {
    const found: [number, number, number, number][] = [];
    for (let y = 260; y < 764; y += 7) for (let x = 260; x < 764; x += 1) if (Math.abs(a(x, y) - b(x, y)) > apart) found.push([x, y, a(x, y), b(x, y)]);
    return found;
  }

  it('lets light, its glow on the wall and its bounce through a wall for sight only, and stops them at a wall for light only', async () => {
    const shown = await pictures(() => ({ lights: [torch] }));
    // Behind a solid wall and behind glass the floor is dark; without a wall and behind a curtain the torch lights it.
    expect(shown.none!(600, 512)).toBeGreaterThan(150);
    expect(shown.solid!(600, 512)).toBeLessThan(6);
    expect(shown.glass!(600, 512)).toBeLessThan(6);
    expect(shown.curtain!(600, 512)).toBeGreaterThan(150);
    // A curtain is no wall for light at all: no line where it stands, no face, no shadow; a closed door for sight only neither.
    expect(differences(shown.curtain!, shown.none!).slice(0, 5)).toEqual([]);
    expect(differences(shown.door!, shown.none!).slice(0, 5)).toEqual([]);
    // Glass is a wall for light like any other.
    expect(differences(shown.glass!, shown.solid!).slice(0, 5)).toEqual([]);
  });

  it('shows a token what lies behind a wall for light only, and nothing behind a wall for sight only', async () => {
    const viewer = (walls: readonly WallSegment[]): Sight => computeSight([{ tokenId: 'v', origin: { x: 400, y: 512 }, range: 4000, senses: [] }], walls);
    const shown = await pictures((walls) => ({ ambient: 1, sight: viewer(walls) }));
    expect(shown.none!(600, 512)).toBeGreaterThan(600);
    expect(shown.solid!(600, 512)).toBeLessThan(6);
    expect(shown.curtain!(600, 512)).toBeLessThan(6);
    expect(shown.glass!(600, 512)).toBeGreaterThan(600);
    expect(differences(shown.glass!, shown.none!).slice(0, 5)).toEqual([]);
    expect(differences(shown.curtain!, shown.solid!).slice(0, 5)).toEqual([]);
  });

  it('keeps explored memory from spreading across a wall for sight only, and lets it spread across one for light only as across open floor', async () => {
    // The west half of the map is remembered, up to the wall's line; memory texels are 2 px.
    const shown = await pictures(() => ({ sight: NO_SIGHT, exploredColor: '#ffffff' }), (renderer) => {
      const memory = RenderTexture.create({ width: MAP / 2, height: MAP / 2 });
      const west = new Graphics().rect(0, 0, 256, MAP / 2).fill({ color: 0xffffff });
      renderer.render({ container: west, target: memory, clear: true, clearColor: [0, 0, 0, 0] });
      west.destroy();
      return memory;
    });
    expect(shown.none!(480, 512)).toBeGreaterThan(20);
    // On open floor the memory's soft edge reaches past the line it was recorded to.
    expect(shown.none!(513.5, 512)).toBeGreaterThan(0);
    for (const kind of ['solid', 'curtain', 'door']) {
      expect([kind, shown[kind]!(480, 512) > 20]).toEqual([kind, true]);
      for (const x of [515.5, 516.5, 518.5, 525]) expect([kind, x, shown[kind]!(x, 512)]).toEqual([kind, x, 0]);
    }
    expect(differences(shown.glass!, shown.none!, 0).slice(0, 5)).toEqual([]);
    expect(differences(shown.curtain!, shown.solid!, 0).slice(0, 5)).toEqual([]);
  });

  it('frees the fields of walls that are gone, and draws on with those that are left', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    engine.setEnabled(true);
    engine.setMode('player');
    const held = (): number => (engine as unknown as { world: { fields: { held: number } } }).world.fields.held;
    const zone = { polygon: [{ x: 300, y: 300 }, { x: 460, y: 300 }, { x: 460, y: 460 }, { x: 300, y: 460 }], ambient: 0.5, soft: 20 };
    const shoot = (drawn: WallSegment[]): ((x: number, y: number) => number) => {
      engine.update({ bounds, albedo: null, walls: sealedWalls(drawn, worldTexel(bounds)), lights: [torch], sight: SEES_ALL, sightRadius: 20, ambient: 0, zones: [zone] });
      engine.flush();
      const read: PixelReader = renderThroughEngine(engine, renderer, camera);
      return (x, y) => sum(read(Math.floor(x) + camera.x, Math.floor(y) + camera.y));
    };
    const wall = (id: string, x: number, extra: Partial<WallSegment>): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x, y: 0 }, p2: { x, y: MAP }, ...extra });
    const plain = shoot(across({}));
    expect(held()).toBe(1);
    // A curtain, a hedge and a one-way wall: the tiles' field, the field of all light walls, the field of sight, and the zones' own.
    shoot([wall('curtain', 700, { blocks: 'sight' }), wall('hedge', 720, { limited: true }), wall('one-way', 740, { direction: 'left' }), ...across({})]);
    expect(held()).toBe(4);
    const after = shoot(across({}));
    expect(held()).toBe(1);
    for (const x of [300, 400, 505, 520, 600]) expect([x, after(x, 512)]).toEqual([x, plain(x, 512)]);
    shoot([wall('curtain', 700, { blocks: 'sight' }), ...across({})]);
    expect(held()).toBe(2);
    expect(watch.findings).toEqual([]);
    expect(engine.failed).toBe(false);
  });
});
