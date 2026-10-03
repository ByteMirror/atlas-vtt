import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { lightLevelAt } from '../../../../vision/lightLevels';
import { SEES_ALL, lightReach, type LightReach } from '../../../../vision/sight';
import { distSqToSegment } from '../../../../vision/visionGeometry';
import { LightingEngine } from '../LightingEngine';
import { LightingWorld } from '../LightingWorld';
import type { EngineLight, EngineScene } from '../types';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 512;
const MAP = 1024;
/** The middle of the map, one screen pixel for one world pixel. */
const camera = { size: SIZE, scale: 1, x: -256, y: -256 };
const bounds = { width: MAP, height: MAP };
const SOURCE = { x: 512, y: 512 };
const darkness: EngineLight = { key: 'darkness', ...SOURCE, bright: 0, dim: 200, flame: 1, color: [1, 1, 1], intensity: 1, animation: 'none', darkness: true };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
/** A wall that points at the source, starting 48 px from it, and one that stands across its light. */
const RADIAL = wall('radial', 560, 512, 680, 512);
const ACROSS = wall('across', 400, 440, 400, 584);
const walls = [RADIAL, ACROSS];
/** Brighter than the veil of magical darkness shows in daylight, far below the day. */
const VEIL = 14;
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

describe('magical darkness at walls', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.restoreAllMocks();
  });

  async function setup(scene: Partial<EngineScene> = {}): Promise<{ engine: LightingEngine; at: (point: { x: number; y: number }) => number; update: (next: Partial<EngineScene>) => void; again: () => (point: { x: number; y: number }) => number }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    engine.setEnabled(true);
    engine.setMode('player');
    let current: EngineScene = { bounds, albedo: null, walls, lights: [darkness], sight: SEES_ALL, sightRadius: 20, ambient: 1, ...scene };
    const update = (next: Partial<EngineScene>): void => {
      current = { ...current, ...next };
      engine.update(current);
      engine.flush();
    };
    update({});
    const read = renderThroughEngine(engine, renderer, camera);
    expect(watch.findings).toEqual([]);
    const again = (): ((point: { x: number; y: number }) => number) => {
      const next = renderThroughEngine(engine, renderer, camera);
      return (point) => luminance(next(Math.floor(point.x) + camera.x, Math.floor(point.y) + camera.y));
    };
    return { engine, update, again, at: (point) => luminance(read(Math.floor(point.x) + camera.x, Math.floor(point.y) + camera.y)) };
  }

  const rule = (lights: readonly EngineLight[]): LightReach[] => lights.map((light) => lightReach({ x: light.x, y: light.y }, light.dim, walls, light.bright, light));

  it('covers a wall that points at it, the wall\'s own line and the floor on both sides of it', async () => {
    const { at } = await setup();
    for (const x of [570, 600, 640, 675]) {
      for (const off of [0, 1, 3, 5, 8, 12, 16, 24, 30]) {
        expect([x, off, at({ x, y: 512 + off }) < VEIL]).toEqual([x, off, true]);
        expect([x, -off, at({ x, y: 512 - off }) < VEIL]).toEqual([x, -off, true]);
      }
    }
    // Past the wall's far end the rule counts the darkness on: a line has no shadow.
    expect(at({ x: 695, y: 512 })).toBeLessThan(VEIL);
  });

  it('is drawn anew when a wall changes: a wall put across it ends the darkness there, and gives it back when it goes', async () => {
    const lights = [darkness];
    const { at, update, again } = await setup({ walls: [], lights });
    const beyond = { x: 372, y: 512 };
    expect(at(beyond)).toBeLessThan(VEIL);
    // The same lights, and a wall between the source and the point.
    update({ walls: [ACROSS] });
    expect(again()(beyond)).toBeGreaterThan(200);
    expect(again()({ x: 430, y: 512 })).toBeLessThan(VEIL);
    update({ walls: [] });
    expect(again()(beyond)).toBeLessThan(VEIL);
  });

  it('gives a lamp its light back where a new wall, far from the lamp, shades it from the darkness', async () => {
    // A lamp 290 px from the source, inside a darkness of 400 px that swallows its light.
    const wide: EngineLight = { ...darkness, dim: 400 };
    const lamp: EngineLight = { key: 'lamp', x: 800, y: 512, bright: 50, dim: 100, flame: 2, color: [1, 1, 1], intensity: 1, animation: 'none' };
    const scene: EngineScene = { bounds, albedo: null, walls: [], lights: [lamp, wide], sight: SEES_ALL, sightRadius: 20, ambient: 0 };
    const { engine, at, again } = await setup(scene);
    const beside = { x: 760, y: 512 };
    expect(at(beside)).toBeLessThan(VEIL);
    // A short wall right at the source, far outside the lamp's reach: its shadow holds the lamp.
    // The update alone draws it, before the bounce that follows a wall change redraws the lights.
    engine.update({ ...scene, walls: [wall('shade', 540, 470, 540, 554)] });
    expect(again()(beside)).toBeGreaterThan(60);
    engine.update(scene);
    expect(again()(beside)).toBeLessThan(VEIL);
  });

  it('agrees with the rule in daylight everywhere but on a wall\'s own core and the darkness\' rim', async () => {
    const { at } = await setup();
    const reaches = rule([darkness]);
    let dark = 0;
    let lit = 0;
    for (let y = 262; y < 762; y += 5) {
      for (let x = 262; x < 762; x += 5) {
        const point = { x: x + 0.5, y: y + 0.5 };
        // Not on a wall's core, and not on the edge of a wall's shadow, where a map texel is half in.
        if (walls.some((w) => distSqToSegment(point, w.p1, w.p2) < 3.5 * 3.5)) continue;
        const outline = reaches[0]!.polygon;
        if (outline.some((a, i) => distSqToSegment(point, a, outline[(i + 1) % outline.length]!) < 3.5 * 3.5)) continue;
        if (Math.abs(Math.hypot(x - SOURCE.x, y - SOURCE.y) - darkness.dim) < 10) continue;
        const level = lightLevelAt(point, { ambient: 1 }, reaches);
        if (level === 'magical-dark') {
          dark++;
          expect([x, y, at(point) < VEIL]).toEqual([x, y, true]);
        } else {
          lit++;
          expect([x, y, at(point) > 150]).toEqual([x, y, true]);
        }
      }
    }
    expect(dark).toBeGreaterThan(3000);
    expect(lit).toBeGreaterThan(3000);
  });

  it('leaves the far side of a wall across it in daylight, up to the wall\'s core', async () => {
    const { at } = await setup();
    for (const y of [460, 512, 560]) {
      expect(at({ x: 404, y })).toBeLessThan(VEIL);
      expect(at({ x: 396, y })).toBeGreaterThan(150);
      expect(at({ x: 380, y })).toBeGreaterThan(150);
    }
  });

  it('is dark up to a few pixels from its radius, where the rule ends it', async () => {
    const { at } = await setup({ walls: [] });
    // 0.95 of the radius: 10 px inside.
    expect(at({ x: 512, y: 512 - 190 })).toBeLessThan(VEIL);
    // 8 px inside: the rim is 6 px wide, and a map texel is 2.
    expect(at({ x: 512, y: 512 - 192 })).toBeLessThan(VEIL);
    expect(at({ x: 512, y: 512 - 203 })).toBeGreaterThan(200);
  });

  it('gives way to a light whose priority is higher by any amount, as the rule does', async () => {
    const lamp: EngineLight = { key: 'lamp', x: 512, y: 440, bright: 60, dim: 120, flame: 10, color: [1, 1, 1], intensity: 1, animation: 'none', priority: 0.5 };
    const lights = [lamp, darkness];
    const { at } = await setup({ walls: [], ambient: 0, lights });
    expect(lightLevelAt({ x: 512, y: 450 }, { ambient: 0 }, lights.map((light) => lightReach({ x: light.x, y: light.y }, light.dim, [], light.bright, light)))).toBe('bright');
    expect(at({ x: 512, y: 450 })).toBeGreaterThan(100);
  });

  it('warns of no destroyed texture when the map changes size under a darkness', async () => {
    const warn = vi.spyOn(console, 'warn');
    const { update } = await setup();
    update({ bounds: { width: 800, height: 800 } });
    update({ lights: [] });
    expect(warn.mock.calls.filter(([message]) => String(message).includes('destroyed'))).toEqual([]);
  });

  it('frees the darkness map once the last darkness is gone', async () => {
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    const world = new LightingWorld(renderer, bounds);
    cleanup.push(() => world.destroy());
    world.update(walls, [darkness], null);
    expect(world.darknessMap()).not.toBeNull();
    expect(world.holdsDarknessMap).toBe(true);
    world.update(walls, [], null);
    expect(world.darknessMap()).toBeNull();
    world.trim();
    expect(world.holdsDarknessMap).toBe(false);
    world.update(walls, [darkness], null);
    expect(world.darknessMap()).not.toBeNull();
  });
});
