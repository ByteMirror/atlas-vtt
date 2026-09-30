/// <reference types="vite/client" />
import { Container, Matrix, RenderTexture, Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import { weldWalls } from '../../../../lighting/weldWalls';
import { distToSeg, segOf } from '../../../../lighting/segments';
import { REVEAL, weldTolerance } from '../../../../lighting/lightingConstants';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import { createTestRenderer, readRgba } from './gpuTestUtils';
import { fuzzRooms, insidePolygon, rng, type P } from './fuzzRooms';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);

interface Report {
  checked: number;
  leaks: number;
  sightChecked: number;
  sightLeaks: number;
  litInside: number;
}

/**
 * Renders every room through the real engine at a random camera and counts pixels past the
 * room's welded walls that are not black: light (direct + bounce, player mode, everything seen,
 * no ambient) and sight (ambient 1, the token where the light is; the drawn wall may show up to
 * REVEAL px + 1.5 screen px past its centre line).
 */
async function fuzz(seed: number, trials: number, gap: boolean): Promise<Report> {
  const renderer = await createTestRenderer(SIZE);
  const engine = new LightingEngine(renderer);
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 1);
    const report: Report = { checked: 0, leaks: 0, sightChecked: 0, sightLeaks: 0, litInside: 0 };
    for (const room of fuzzRooms(seed, trials, gap)) {
      const walls = weldWalls(room.walls, weldTolerance(2));
      const roomWalls = walls.slice(0, room.roomWallCount);
      const outline: P[] = roomWalls.map((w) => [w.p1.x, w.p1.y]);
      if (!insidePolygon(room.light, outline)) continue;
      const distToRoom = (p: P): number => Math.min(...roomWalls.map((w) => distToSeg(p[0], p[1], segOf(w))));
      const dim = 150 + rand() * 500;
      const light = { key: 'l', x: room.light[0], y: room.light[1], bright: dim / 2, dim, flame: 2 + rand() * 90, color: [1, 1, 1] as const, intensity: 1, animation: 'none' as const };
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - room.light[0] * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - room.light[1] * scale + (rand() - 0.5) * 200;
      const shoot = (sightOn: boolean): Uint8ClampedArray => {
        const stage = new Container();
        const map = new Sprite(Texture.WHITE);
        map.setSize(2048, 2048);
        const world = new Container();
        world.addChild(map, engine.layer);
        world.scale.set(scale);
        world.position.set(x, y);
        stage.addChild(world);
        try {
          engine.update({
            bounds: { width: 2048, height: 2048 }, albedo: null, walls, lights: sightOn ? [] : [light],
            sight: sightOn ? computeSight([{ tokenId: 't', origin: { x: room.light[0], y: room.light[1] }, range: 4000, darkvision: 0 }], walls) : SEES_ALL,
            sightRadius: 20 + rand() * 40, ambient: sightOn ? 1 : 0,
          });
          engine.flush();
          engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
          renderer.render({ container: stage, target, clear: true });
          return readRgba(renderer, target);
        } finally {
          world.removeChild(engine.layer);
          stage.destroy({ children: true });
        }
      };
      const lit = shoot(false);
      const seen = shoot(true);
      for (let sy = 0; sy < SIZE; sy += 2) {
        for (let sx = 0; sx < SIZE; sx += 2) {
          const p: P = [(sx + 0.5 - x) / scale, (sy + 0.5 - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > 2048 || p[1] > 2048) continue;
          const o = (sy * SIZE + sx) * 4;
          const inside = insidePolygon(p, outline);
          const d = distToRoom(p);
          if (inside && lit[o]! > 0) report.litInside++;
          if (!inside && d > 0.01) {
            report.checked++;
            if (lit[o]! + lit[o + 1]! + lit[o + 2]! > 0) report.leaks++;
          }
          if (!inside && d > REVEAL + 1.5 / scale) {
            report.sightChecked++;
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

describe('leak fuzz', () => {
  it('lets no light, bounce or sight past the walls of closed rooms', { timeout: 3_600_000 }, async () => {
    const report = await fuzz(11, TRIALS, false);
    console.info(`leak fuzz: ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.checked).toBeGreaterThan(TRIALS * 1000);
    expect(report.litInside).toBeGreaterThan(TRIALS * 100);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0 });
  });

  it('finds light and sight past a wall with a gap (the check can fail)', async () => {
    const report = await fuzz(11, 4, true);
    console.info(`negative control: ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(0);
    expect(report.sightLeaks).toBeGreaterThan(0);
  });
});
