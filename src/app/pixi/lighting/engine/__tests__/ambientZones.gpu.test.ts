import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_SENSES } from '../../../../gameSystems/senses';
import type { TokenEntity } from '../../../../types';
import type { WallSegment } from '../../../../types/wallTypes';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, computeSight, sightSources } from '../../../../vision/sight';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { LightingEngine } from '../LightingEngine';
import { ZoneMap } from '../ZoneMap';
import type { EngineLight, EngineScene, EngineZone } from '../types';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 512;
const MAP = 1024;
/** The middle of the map, one screen pixel for one world pixel. */
const camera = { size: SIZE, scale: 1, x: -256, y: -256 };
const bounds = { width: MAP, height: MAP };
const SOFT = 20;
const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
/** A cave: dark by day, 300 px square. */
const cave: EngineZone = { polygon: rect(400, 400, 300, 300), ambient: 0, soft: SOFT };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
/** A wall along the cave's left side, with a doorway from 520 to 580. */
const walls = [wall('upper', 400, 380, 400, 520), wall('lower', 400, 580, 400, 720)];
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

describe('ambient zones in the composite', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function setup(scene: Partial<EngineScene> = {}): Promise<{ engine: LightingEngine; pixel: (point: { x: number; y: number }) => readonly [number, number, number]; at: (point: { x: number; y: number }) => number; again: () => (point: { x: number; y: number }) => number }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update({ bounds, albedo: null, walls: [], lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 1, zones: [cave], ...scene });
    engine.flush();
    const read = renderThroughEngine(engine, renderer, camera);
    // The zone map's pass and the composite's new inputs are valid under the strict context.
    expect(watch.findings).toEqual([]);
    expect(engine.failed).toBe(false);
    const pixel = (point: { x: number; y: number }): readonly [number, number, number] => read(Math.floor(point.x) + camera.x, Math.floor(point.y) + camera.y);
    const again = (): ((point: { x: number; y: number }) => number) => {
      const next = renderThroughEngine(engine, renderer, camera);
      return (point) => luminance(next(Math.floor(point.x) + camera.x, Math.floor(point.y) + camera.y));
    };
    return { engine, pixel, at: (point) => luminance(pixel(point)), again };
  }

  it('agrees with the rule: dark where the rule counts the cave, daylight where it counts the scene', async () => {
    const { at } = await setup();
    const ambient = { ambient: 1, zones: [cave] };
    let dark = 0;
    let lit = 0;
    for (let y = 262; y < 762; y += 6) {
      for (let x = 262; x < 762; x += 6) {
        const point = { x: x + 0.5, y: y + 0.5 };
        // The soft edge lies outside the cave, as far as it is wide (and a map texel of filtering either way).
        const outline = cave.polygon;
        if (outline.some((a, i) => distSqToSegment(point, a, outline[(i + 1) % outline.length]!) < (SOFT + 3) ** 2)) continue;
        if (lightLevelAt(point, ambient, []) === 'dark') {
          dark++;
          expect([x, y, at(point) < 4]).toEqual([x, y, true]);
        } else {
          lit++;
          expect([x, y, at(point) > 230]).toEqual([x, y, true]);
        }
      }
    }
    expect(dark).toBeGreaterThan(1500);
    expect(lit).toBeGreaterThan(3000);
  });

  it('shows the zone\'s level up to its edge: three pixels inside it the cave is as dark as a pitch-black scene', async () => {
    const zoned = await setup();
    const night = await setup({ ambient: 0, zones: [] });
    for (const point of [{ x: 403, y: 450 }, { x: 550, y: 403 }, { x: 697, y: 650 }, { x: 550, y: 697 }, { x: 550, y: 550 }]) {
      zoned.pixel(point).forEach((channel, i) => expect(Math.abs(channel - night.pixel(point)[i]!)).toBeLessThanOrEqual(2));
    }
  });

  it('has a soft edge past its outline where no wall is: darker than the day there, lighter than the cave, and daylight beyond its width', async () => {
    const { at } = await setup();
    const steps = [2, 6, 10, 14, 18].map((out) => at({ x: 550, y: 400 - out }));
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThanOrEqual(steps[i - 1]! - 1);
    expect(steps[0]!).toBeLessThan(120);
    expect(steps[2]!).toBeGreaterThan(steps[0]! + 20);
    expect(steps[2]!).toBeLessThan(225);
    expect(at({ x: 550, y: 400 - SOFT - 4 })).toBeGreaterThan(230);
  });

  it('ends at a wall along its edge and spills softly through a doorway in it', async () => {
    const { at } = await setup({ walls });
    // Behind the wall, 8 px past the cave's edge: daylight, where without the wall the edge is soft.
    expect(at({ x: 392, y: 450 })).toBeGreaterThan(230);
    expect(at({ x: 392, y: 650 })).toBeGreaterThan(230);
    // In front of the doorway the darkness of the cave reaches out.
    expect(at({ x: 392, y: 550 })).toBeLessThan(200);
    expect(at({ x: 370, y: 550 })).toBeGreaterThan(230);
    const open = await setup();
    expect(open.at({ x: 392, y: 450 })).toBeLessThan(200);
  });

  it('is drawn anew when a wall changes: a doorway that is closed ends the zone\'s soft edge there', async () => {
    const scene = { bounds, albedo: null, lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 1, zones: [cave] };
    const { engine, at, again } = await setup({ ...scene, walls });
    expect(at({ x: 392, y: 550 })).toBeLessThan(200);
    // The same zones, and a door across the doorway.
    engine.update({ ...scene, walls: [...walls, wall('door', 400, 520, 400, 580)] });
    engine.flush();
    expect(again()({ x: 392, y: 550 })).toBeGreaterThan(230);
    // And open again: the darkness of the cave reaches out as before.
    engine.update({ ...scene, walls });
    engine.flush();
    expect(again()({ x: 392, y: 550 })).toBeLessThan(200);
  });

  describe('a lit room in a dark scene, its zone drawn on the room\'s walls', () => {
    /** The cave's four sides as walls, and the zone's corners on their ends. */
    const room = [wall('n', 400, 400, 700, 400), wall('e', 700, 400, 700, 700), wall('s', 700, 700, 400, 700), wall('w', 400, 700, 400, 400)];
    const lit = { ...cave, ambient: 1 };
    const viewer = (x: number): EngineScene['sight'] => computeSight(sightSources({ v: { id: 'v', kind: 'token', imagePath: 'v.png', x, y: 550, vision: { enabled: true } } }, { unitDistance: 5, cellSize: 70 }, bounds, { definitions: BUILT_IN_SENSES['builtin:dnd5e']!, conditions: [] }), room);

    it('shows no bright line on its wall to a token in the dark outside', async () => {
      const { at } = await setup({ ambient: 0, zones: [lit], walls: room, sight: viewer(300) });
      // Across the west wall, from the corridor over the centre line into what the wall hides.
      for (let x = 380; x <= 420; x += 0.5) expect([x, at({ x, y: 550 }) < 6]).toEqual([x, true]);
      for (let y = 420; y <= 680; y += 13) expect([y, at({ x: 400.4, y }) < 6, at({ x: 399.6, y }) < 6]).toEqual([y, true, true]);
    });

    it('lights its walls\' faces from inside: a face has the ambient light of the floor in front of it', async () => {
      const { at } = await setup({ ambient: 0, zones: [lit], walls: room, sight: viewer(550) });
      // From the wall's core on (three pixels from its centre line) the face is as bright as the floor.
      for (const x of [403.5, 404.5, 405.5, 407.5, 430]) expect([x, at({ x, y: 550 }) > 230]).toEqual([x, true]);
      for (const y of [403.5, 404.5, 405.5]) expect([y, at({ x: 550, y }) > 230]).toEqual([y, true]);
    });

    it('keeps the walls inside a dark zone dark by day, their core too, and lights a wall on its edge only from the day side', async () => {
      const pillar = wall('pillar', 550, 480, 550, 620);
      const { at } = await setup({ ambient: 1, zones: [cave], walls: [...room, pillar] });
      for (const x of [546, 549, 550.5, 552, 555]) expect([x, at({ x, y: 550 }) < 6]).toEqual([x, true]);
      // The west wall stands between the day and the cave: daylight on its outer face, none within.
      for (const x of [394.5, 395.5, 396.5]) expect([x, at({ x, y: 550 }) > 200]).toEqual([x, true]);
      expect(at({ x: 405, y: 550 })).toBeLessThan(6);
      expect(at({ x: 400.5, y: 550 })).toBeLessThan(6);
      expect(at({ x: 399.5, y: 550 })).toBeLessThan(6);
    });

    it('takes a zone off its walls when the scene turns darker than the zone', async () => {
      const zones = [{ ...cave, ambient: 0.5 }];
      const scene = { bounds, albedo: null, walls: room, lights: [], sight: SEES_ALL, sightRadius: 20, zones };
      const { engine, at, again } = await setup({ ...scene, ambient: 1 });
      // By day the dimmer zone lies on its walls, both halves of them.
      const dim = at({ x: 550, y: 550 });
      expect(dim).toBeLessThan(at({ x: 300, y: 550 }) - 40);
      expect(Math.abs(at({ x: 398.5, y: 550 }) - dim)).toBeLessThan(6);
      // By night the same zones are the brighter light: none of it on a wall.
      engine.update({ ...scene, ambient: 0 });
      engine.flush();
      const night = again();
      expect(night({ x: 550, y: 550 })).toBeGreaterThan(40);
      for (const x of [398.5, 399.5, 400.5, 401.5]) expect([x, night({ x, y: 550 }) < 6]).toEqual([x, true]);
    });
  });

  it('is drawn anew for the scene\'s ambient light only when that changes which zones are darker than the scene', async () => {
    const zones = [{ ...cave, ambient: 0.5 }];
    const scene = { bounds, albedo: null, walls, lights: [], sight: SEES_ALL, sightRadius: 20, zones };
    const { engine, again } = await setup({ ...scene, ambient: 1 });
    const draw = vi.spyOn(ZoneMap.prototype, 'draw');
    cleanup.push(() => draw.mockRestore());
    const lum = (ambient: number, point: { x: number; y: number }): number => {
      engine.update({ ...scene, ambient });
      engine.flush();
      return again()(point);
    };
    // Dusk falls over a zone that stays the darker light: the scene follows, the zone map is the same.
    const day = lum(0.9, { x: 200, y: 300 });
    expect(lum(0.7, { x: 200, y: 300 })).toBeLessThan(day - 10);
    expect(lum(0.6, { x: 200, y: 300 })).toBeLessThan(day - 20);
    expect(draw).not.toHaveBeenCalled();
    // Once the scene is the darker one, the zone leaves its walls.
    lum(0.4, { x: 200, y: 300 });
    expect(draw).toHaveBeenCalledTimes(1);
    lum(0.2, { x: 200, y: 300 });
    expect(draw).toHaveBeenCalledTimes(1);
    // Another colour of the scene's light is another light for a zone without one of its own.
    engine.update({ ...scene, ambient: 0.2, ambientColor: '#ff8800' });
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('lights a zone of a dark scene, tinted by its own colour, and lays later zones over earlier ones', async () => {
    const hall: EngineZone = { polygon: rect(450, 450, 100, 100), ambient: 1, ambientColor: '#ff4040', soft: SOFT };
    const { at, pixel } = await setup({ ambient: 0, zones: [{ ...cave, ambient: 0.6 }, hall] });
    expect(at({ x: 300, y: 300 })).toBeLessThan(4);
    expect(at({ x: 650, y: 650 })).toBeGreaterThan(100);
    const [r, g, b] = pixel({ x: 500, y: 500 });
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(r - 60);
    expect(b).toBeLessThan(r - 60);
  });

  it('is swallowed by magical darkness like the scene\'s ambient light', async () => {
    const darkness: EngineLight = { key: 'darkness', x: 550, y: 550, bright: 0, dim: 60, flame: 1, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true };
    const { at } = await setup({ ambient: 0, zones: [{ ...cave, ambient: 1 }], lights: [darkness] });
    expect(at({ x: 550, y: 550 })).toBeLessThan(14);
    expect(at({ x: 650, y: 650 })).toBeGreaterThan(230);
  });

  it('shows a dim zone as bright to a sense that sees dim light as bright', async () => {
    const definitions = BUILT_IN_SENSES['builtin:dnd5e']!;
    const viewer = (senses: { id: string; range: number }[]): TokenEntity => ({ id: 'v', kind: 'token', imagePath: 'v.png', x: 550, y: 550, vision: { enabled: true, senses } });
    const sightOf = (token: TokenEntity): EngineScene['sight'] => computeSight(sightSources({ v: token }, { unitDistance: 5, cellSize: 70 }, bounds, { definitions, conditions: [] }), []);
    const dim = { ...cave, ambient: 0.5 };
    const plain = await setup({ ambient: 0, zones: [dim], sight: sightOf(viewer([])) });
    const darkvision = await setup({ ambient: 0, zones: [dim], sight: sightOf(viewer([{ id: 'dnd5e-darkvision', range: 60 }])) });
    expect(darkvision.at({ x: 600, y: 600 })).toBeGreaterThan(plain.at({ x: 600, y: 600 }) + 20);
  });

  it('follows a zone that is drawn anew, and holds no zone map for a scene without zones', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    const scene: EngineScene = { bounds, albedo: null, walls: [], lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 1, zones: [cave] };
    const lum = (zones: readonly EngineZone[], point: { x: number; y: number }): number => {
      engine.update({ ...scene, zones });
      engine.flush();
      return luminance(renderThroughEngine(engine, renderer, camera)(point.x + camera.x, point.y + camera.y));
    };
    expect(lum([cave], { x: 550, y: 550 })).toBeLessThan(4);
    expect(lum([{ ...cave, polygon: rect(600, 600, 100, 100) }], { x: 550, y: 550 })).toBeGreaterThan(230);
    expect(lum([], { x: 650, y: 650 })).toBeGreaterThan(230);
    expect((engine as unknown as { world: { holdsZoneMap: boolean } }).world.holdsZoneMap).toBe(false);
  });
});
