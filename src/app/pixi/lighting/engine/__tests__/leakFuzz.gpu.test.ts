/// <reference types="vite/client" />
import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightingEngine } from '../LightingEngine';
import type { EngineLight } from '../types';
import { sealWalls } from '../../../../lighting/sealWalls';
import { placeLight } from '../../../../lighting/lightPlacement';
import { allSegments, splitBlocking } from '../../../../lighting/segments';
import { LIGHT_REACH, sealTolerance, worldTexel } from '../../../../lighting/lightingConstants';
import { SEES_ALL, computeSight } from '../../../../vision/sight';
import type { MapBounds } from '../../../../vision/visibility';
import { createTestRenderer, readRgba } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, rng, roomOutline, type P } from './fuzzRooms';

const SIZE = 384;
const TRIALS = Number(import.meta.env.VITE_LEAK_TRIALS ?? 24);

interface Report {
  rooms: number;
  /** Rooms with a closed door, with one-way walls, with two lights among their outline. */
  doors: number;
  oneWay: number;
  twoLights: number;
  checked: number;
  leaks: number;
  sightChecked: number;
  sightLeaks: number;
  litInside: number;
  /** Lit pixels inside the room beyond every light's reach: only bounce lights them. */
  bounceInside: number;
}

interface FuzzOptions {
  seed: number;
  trials: number;
  /** Opens one wall of every room (the negative control). */
  gap?: boolean | number;
  bounds?: MapBounds;
  /** Device pixels per screen pixel of the renderer and its target (2 on Retina displays). */
  resolution?: number;
}

/**
 * Renders every room through the real engine at a random camera and counts pixels past the
 * room's walls (as drawn, joined by their bridges) that are not black: light (direct + bounce,
 * player mode, everything seen, no ambient) and sight (ambient 1, a token at each light; sight
 * stops at the centre line, so only filtering may show past it: 1.5 screen px).
 */
async function fuzz({ seed, trials, gap = false, bounds = { width: 2048, height: 2048 }, resolution = 1 }: FuzzOptions): Promise<Report> {
  const renderer = await createTestRenderer(SIZE, resolution);
  const engine = new LightingEngine(renderer);
  const target = RenderTexture.create({ width: SIZE, height: SIZE, resolution });
  const device = SIZE * resolution;
  try {
    engine.setEnabled(true);
    engine.setMode('player');
    const rand = rng(seed + 1);
    const report: Report = { rooms: 0, doors: 0, oneWay: 0, twoLights: 0, checked: 0, leaks: 0, sightChecked: 0, sightLeaks: 0, litInside: 0, bounceInside: 0 };
    for (const room of fuzzRooms(seed, trials, gap)) {
      const texel = worldTexel(bounds);
      const walls = sealWalls(room.walls, sealTolerance(texel));
      const outline = roomOutline(room);
      if (!room.lights.every((p) => insidePolygon(p, outline))) continue;
      report.rooms++;
      const outlineWalls = room.walls.slice(0, room.roomWallCount);
      if (outlineWalls.some((w) => w.type === 'door')) report.doors++;
      if (outlineWalls.some((w) => w.direction)) report.oneWay++;
      if (room.lights.length > 1) report.twoLights++;
      const lights: EngineLight[] = room.lights.map(([x, y], i) => {
        const dim = 150 + rand() * 500;
        return { key: `l${i}`, x, y, bright: dim / 2, dim, flame: 2 + rand() * 90, color: [1, 1, 1], intensity: 1, animation: 'none' };
      });
      const [first] = room.lights;
      const scale = 0.2 + rand() * 2;
      const x = SIZE / 2 - first![0] * scale + (rand() - 0.5) * 200;
      const y = SIZE / 2 - first![1] * scale + (rand() - 0.5) * 200;
      const sightRadius = 20 + rand() * 40;
      const sources = lights.map((light) => ({ tokenId: light.key, origin: { x: light.x, y: light.y }, range: 4000, darkvision: 0 }));
      const shoot = (sightOn: boolean): Uint8ClampedArray => {
        engine.update({
          bounds, albedo: null, walls, lights: sightOn ? [] : lights,
          sight: sightOn ? computeSight(sources, walls) : SEES_ALL, sightRadius, ambient: sightOn ? 1 : 0,
        });
        engine.flush();
        return renderView(renderer, engine, target, bounds, scale, x, y);
      };
      const lit = shoot(false);
      const seen = shoot(true);
      // Direct light ends at the reach around where the engine places each light (plus the light map's bilinear texel).
      const placed = lights.map((l) => ({ at: placeLight(l.x, l.y, l.flame, allSegments(splitBlocking(walls)), texel), reach: l.dim * LIGHT_REACH + 2 * texel }));
      const beyondReach = (p: P): boolean => placed.every(({ at, reach }) => !at || Math.hypot(p[0] - at.x, p[1] - at.y) > reach);
      for (let sy = 0; sy < device; sy += 1) {
        for (let sx = 0; sx < device; sx += 1) {
          const p: P = [((sx + 0.5) / resolution - x) / scale, ((sy + 0.5) / resolution - y) / scale];
          if (p[0] < 0 || p[1] < 0 || p[0] > bounds.width || p[1] > bounds.height) continue;
          const o = (sy * device + sx) * 4;
          const inside = insidePolygon(p, outline);
          const d = distToOutline(p, outline);
          if (inside && lit[o]! > 0) {
            report.litInside++;
            if (beyondReach(p)) report.bounceInside++;
          }
          if (!inside && d > 0.01) {
            report.checked++;
            if (lit[o]! + lit[o + 1]! + lit[o + 2]! > 0) report.leaks++;
          }
          if (!inside && d > 1.5 / scale + 0.01) {
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

/** A white map under the lighting layer, seen through a camera at `scale` offset by (x, y). */
function renderView(renderer: WebGLRenderer, engine: LightingEngine, target: RenderTexture, bounds: MapBounds, scale: number, x: number, y: number): Uint8ClampedArray {
  const stage = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(bounds.width, bounds.height);
  const world = new Container();
  world.addChild(map, engine.layer);
  world.scale.set(scale);
  world.position.set(x, y);
  stage.addChild(world);
  try {
    engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
    renderer.render({ container: stage, target, clear: true });
    return readRgba(renderer, target);
  } finally {
    world.removeChild(engine.layer);
    stage.destroy({ children: true });
  }
}

describe('leak fuzz', () => {
  it('lets no light, bounce or sight past the walls of closed rooms', { timeout: 3_600_000 }, async () => {
    const report = await fuzz({ seed: 11, trials: TRIALS });
    console.info(`leak fuzz: ${JSON.stringify({ trials: TRIALS, ...report })}`);
    expect(report.rooms).toBeGreaterThan(TRIALS * 0.8);
    expect(Math.min(report.doors, report.oneWay, report.twoLights)).toBeGreaterThan(TRIALS / 8);
    expect(report.checked).toBeGreaterThan(TRIALS * 1000);
    expect(report.litInside).toBeGreaterThan(TRIALS * 100);
    expect(report.bounceInside).toBeGreaterThan(TRIALS * 10);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0 });
  });

  it('holds on a map large enough for coarser texels', { timeout: 600_000 }, async () => {
    const bounds = { width: 9000, height: 9000 };
    expect(worldTexel(bounds)).toBeGreaterThan(2);
    const report = await fuzz({ seed: 7, trials: 8, bounds });
    console.info(`leak fuzz (large map): ${JSON.stringify(report)}`);
    expect(Math.min(report.doors, report.oneWay, report.twoLights)).toBeGreaterThan(0);
    expect(report.checked).toBeGreaterThan(8000);
    expect(report.litInside).toBeGreaterThan(800);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0 });
  });

  it('holds at renderer resolution 2', { timeout: 600_000 }, async () => {
    const report = await fuzz({ seed: 5, trials: 8, resolution: 2 });
    console.info(`leak fuzz (resolution 2): ${JSON.stringify(report)}`);
    expect(report.checked).toBeGreaterThan(8 * 4000);
    expect(report.litInside).toBeGreaterThan(800);
    expect(report).toMatchObject({ leaks: 0, sightLeaks: 0 });
  });

  it('finds light and sight past a wall with a gap (the check can fail)', async () => {
    // Nine tenths of one wall open.
    const report = await fuzz({ seed: 11, trials: 6, gap: 0.9 });
    console.info(`negative control: ${JSON.stringify(report)}`);
    expect(report.leaks).toBeGreaterThan(1000);
    expect(report.sightLeaks).toBeGreaterThan(1000);
  });
});
