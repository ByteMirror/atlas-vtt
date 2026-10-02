import { afterEach, describe, expect, it } from 'vitest';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineScene, EngineZone } from '../types';
import { createTestRenderer, renderThroughEngine } from './gpuTestUtils';
import { watchGl } from './strictGl';

const SIZE = 512;
const MAP = 1024;
const camera = { size: SIZE, scale: 1, x: -256, y: -256 };
const bounds = { width: MAP, height: MAP };
const rect = (x: number, y: number, w: number, h: number): { x: number; y: number }[] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
/** A clearing in daylight in a scene at night, 300 px square. */
const clearing: EngineZone = { polygon: rect(400, 400, 300, 300), ambient: 1, soft: 20 };
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<WallSegment> = {}): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, ...extra });
const luminance = ([r, g, b]: readonly number[]): number => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

describe('ambient zones and limited walls', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function picture(walls: WallSegment[], scene: Partial<EngineScene> = {}): Promise<(x: number, y: number) => number> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const engine = new LightingEngine(renderer);
    cleanup.push(() => engine.destroy());
    const watch = watchGl(renderer.gl);
    cleanup.push(() => watch.stop());
    engine.setEnabled(true);
    engine.setMode('player');
    engine.update({ bounds, albedo: null, walls, lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 0, zones: [clearing], ...scene });
    engine.flush();
    const read = renderThroughEngine(engine, renderer, camera);
    expect(watch.findings).toEqual([]);
    expect(engine.failed).toBe(false);
    return (x, y) => luminance(read(Math.floor(x) + camera.x, Math.floor(y) + camera.y));
  }

  const hedge = wall('hedge', 500, 300, 500, 800, { limited: true });
  /** A wall that blocks one way, elsewhere in the clearing: with it the zones read a field of their own. */
  const oneWay = wall('one-way', 620, 450, 620, 600, { direction: 'left' });

  it.each<[string, WallSegment[]]>([
    ['alone', [hedge]],
    ['in a scene with a wall that blocks one way', [hedge, oneWay]],
  ])('draws no dark line where a limited wall stands in a brighter zone: %s', async (_name, walls) => {
    const at = await picture(walls);
    const beside = at(470, 550);
    expect(beside).toBeGreaterThan(200);
    for (const x of [494, 496, 498, 499, 500, 501, 502, 504, 506]) expect([x, Math.abs(at(x, 550) - beside) < 6]).toEqual([x, true]);
    // The zone's soft edge passes the hedge as light passes it: no notch where the hedge crosses the edge.
    const edge = at(470, 392);
    expect(edge).toBeGreaterThan(20);
    for (const x of [496, 500, 504]) expect([x, Math.abs(at(x, 392) - edge) < 6]).toEqual([x, true]);
  });

  it('still ends a zone at a solid wall and at a wall that blocks one way, with limited walls in the scene', async () => {
    // A solid wall along the clearing's right edge, and the one-way wall inside it.
    const at = await picture([hedge, oneWay, wall('solid', 700, 380, 700, 720)]);
    // Past the solid wall: none of the zone's soft edge.
    expect(at(708, 550)).toBeLessThan(4);
    expect(at(690, 550)).toBeGreaterThan(200);
    // The solid wall's own line and the one-way wall's keep the look they have in any scene: the zone is not drawn on them.
    const plain = await picture([oneWay, wall('solid', 700, 380, 700, 720)]);
    for (const [x, y] of [[700, 550], [620, 520], [619, 520], [621, 520]] as const) expect([x, y, Math.abs(at(x, y) - plain(x, y)) < 3]).toEqual([x, y, true]);
  });

  it('keeps a hedge in a zone darker than its scene as dark as the zone', async () => {
    const cave: EngineZone = { ...clearing, ambient: 0 };
    const at = await picture([hedge], { ambient: 1, zones: [cave] });
    for (const x of [470, 496, 500, 504, 530]) expect([x, at(x, 550) < 4]).toEqual([x, true]);
  });
});
