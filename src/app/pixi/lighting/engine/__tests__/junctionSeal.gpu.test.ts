import { RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { sealTolerance, wallBand, worldTexel } from '../../../../lighting/lightingConstants';
import { sealWalls } from '../../../../lighting/sealWalls';
import type { WallSegment } from '../../../../types/wallTypes';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight } from '../types';
import { createTestRenderer } from './gpuTestUtils';
import { rng } from './fuzzRooms';
import { renderView } from './leakFuzzScene';

const SIZE = 384;
const BOUNDS = { width: 1024, height: 1024 };
const HUB = { x: 512, y: 512 };

/**
 * A wheel: a closed rim 300 px out, and spokes from it that stop short of the hub (by `stop`
 * pixels, and two more at most), so short of each other. Sealing closes the hub: with more than
 * eight spokes each end is bridged to its nearest neighbours only, not to every other end.
 */
function wheel(spokes: number, stop: number, rand: () => number): WallSegment[] {
  const on = (i: number, radius: number): { x: number; y: number } => ({ x: HUB.x + Math.cos((i / spokes) * Math.PI * 2) * radius, y: HUB.y + Math.sin((i / spokes) * Math.PI * 2) * radius });
  return Array.from({ length: spokes }, (_, i): WallSegment[] => [
    { id: `rim${i}`, kind: 'wall', type: 'solid', p1: on(i, 300), p2: on(i + 1, 300) },
    { id: `spoke${i}`, kind: 'wall', type: 'solid', p1: on(i, 300), p2: on(i, stop + rand() * 2) },
  ]).flat();
}

interface Report {
  /** Pixels of the slice the light and the token stand in that are lit, and that are seen. */
  litInside: number;
  seenInside: number;
  /** Pixels of the other slices, off the walls and the hub, that are lit, and that are seen. */
  lightLeaks: number;
  sightLeaks: number;
}

/** Lights one slice of a wheel from a spot near its hub, looks from the same spot, and counts what shows of the other slices. */
async function look(spokes: number, stop: number, seal: boolean): Promise<Report> {
  const renderer = await createTestRenderer(SIZE);
  const engine = new LightingEngine(renderer);
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  const texel = worldTexel(BOUNDS);
  const report: Report = { litInside: 0, seenInside: 0, lightLeaks: 0, sightLeaks: 0 };
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(spokes);
    for (let trial = 0; trial < 16; trial++) {
      const drawn = wheel(spokes, stop, rand);
      const walls = seal ? sealWalls(drawn, sealTolerance(texel)) : drawn;
      const slice = Math.floor(rand() * spokes);
      const turn = (Math.PI * 2) / spokes;
      // In the middle of its slice, far enough out to stand clear of both spokes.
      const out = Math.max(30, (wallBand(texel) + 6) / Math.sin(turn / 2));
      const spot = { x: HUB.x + Math.cos((slice + 0.5) * turn) * out, y: HUB.y + Math.sin((slice + 0.5) * turn) * out };
      const light: EngineLight = { key: 'light', ...spot, bright: 300, dim: 600, flame: 3, color: [1, 1, 1], intensity: 1, animation: 'none' };
      const scale = 0.55;
      const shoot = (sightOn: boolean): Uint8ClampedArray => {
        engine.update({
          bounds: BOUNDS, albedo: null, walls, lights: sightOn ? [] : [light], sightRadius: 31, ambient: sightOn ? 1 : 0,
          sight: sightOn ? computeSight([{ tokenId: 'token', origin: spot, range: 4000, senses: [] }], walls) : SEES_ALL,
        });
        engine.flush();
        return renderView(renderer, engine, target, BOUNDS, scale, SIZE / 2 - HUB.x * scale, SIZE / 2 - HUB.y * scale);
      };
      const lit = shoot(false);
      const seen = shoot(true);
      const margin = wallBand(texel) + 2 / scale;
      for (let sy = 0; sy < SIZE; sy++) {
        for (let sx = 0; sx < SIZE; sx++) {
          const dx = (sx + 0.5 - SIZE / 2) / scale, dy = (sy + 0.5 - SIZE / 2) / scale;
          const radius = Math.hypot(dx, dy);
          // Off the hub, where the ends and their bridges lie, and inside the rim.
          if (radius < sealTolerance(texel) + margin || radius > 280) continue;
          const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
          const at = Math.floor(angle / turn);
          // Off the spokes: a wall's face shows the light of the floor in front of it.
          const fromSpoke = Math.min(angle - at * turn, (at + 1) * turn - angle) * radius;
          if (fromSpoke < margin) continue;
          const o = (sy * SIZE + sx) * 4;
          if (at === slice) {
            if (lit[o]! > 0) report.litInside++;
            if (seen[o]! > 0) report.seenInside++;
          } else {
            if (lit[o]! + lit[o + 1]! + lit[o + 2]! > 0) report.lightLeaks++;
            if (seen[o]! + seen[o + 1]! + seen[o + 2]! > 0) report.sightLeaks++;
          }
        }
      }
    }
    return report;
  } finally {
    engine.destroy();
    target.destroy(true);
    renderer.destroy();
  }
}

describe('a junction of many walls that end within the tolerance of each other', () => {
  it.each([8, 12, 24])('lets no light and no sight from one slice of a wheel of %i spokes into another', { timeout: 300_000 }, async (spokes) => {
    const report = await look(spokes, 3, true);
    console.info(`junction of ${spokes} walls: ${JSON.stringify(report)}`);
    expect(report.litInside).toBeGreaterThan(1000);
    expect(report.seenInside).toBeGreaterThan(1000);
    expect(report).toMatchObject({ lightLeaks: 0, sightLeaks: 0 });
  });

  it('closes a hub the spokes stop fifteen pixels short of, which is open to light and sight unsealed (the checks can fail)', { timeout: 300_000 }, async () => {
    const open = await look(8, 15, false);
    const closed = await look(8, 15, true);
    console.info(`junction of 8 walls around an open hub: unsealed ${JSON.stringify(open)}, sealed ${JSON.stringify(closed)}`);
    expect(open.lightLeaks).toBeGreaterThan(1000);
    expect(open.sightLeaks).toBeGreaterThan(1000);
    expect(closed).toMatchObject({ lightLeaks: 0, sightLeaks: 0 });
  });
});
