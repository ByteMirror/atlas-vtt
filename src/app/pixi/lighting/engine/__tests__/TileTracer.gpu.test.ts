import type { RenderTexture, WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { TileTracer } from '../TileTracer';
import { TileCache, type Tile } from '../TileCache';
import { sealWalls } from '../../../../lighting/sealWalls';
import { allSegments, splitBlocking } from '../../../../lighting/segments';
import { sealTolerance, wallRadius } from '../../../../lighting/lightingConstants';
import { placeLight } from '../../../../lighting/lightPlacement';
import { createTestRenderer, readUnorm } from './gpuTestUtils';
import { distToOutline, fuzzRooms, insidePolygon, roomOutline, type P } from './fuzzRooms';
import type { EngineLight } from '../types';

const TEXEL = 2;

interface LitCount {
  rooms: number;
  outside: number;
  litOutside: number;
  litInside: number;
}

async function litOutside(gap: boolean, count: number): Promise<LitCount> {
  const renderer = await createTestRenderer(64);
  const result: LitCount = { rooms: 0, outside: 0, litOutside: 0, litInside: 0 };
  try {
    for (const room of fuzzRooms(17, count, gap)) {
      const walls = sealWalls(room.walls, sealTolerance(TEXEL));
      const outline = roomOutline(room);
      const light = room.lights[0]!;
      if (!insidePolygon(light, outline)) continue;
      // One-way outline walls block from the light's side: trace them as two-way walls.
      const blocking = allSegments(splitBlocking(walls));
      const placed = placeLight(light[0], light[1], 40, blocking, TEXEL);
      if (!placed) continue;
      result.rooms++;
      const field = new CapsuleField(renderer, [0, 0, 2048, 2048], TEXEL, wallRadius(TEXEL));
      const tracer = new TileTracer(renderer, field);
      let tile: RenderTexture | null = null;
      try {
        field.build(blocking);
        const reach = 500;
        const x0 = Math.floor((placed.x - reach) / TEXEL) * TEXEL, y0 = Math.floor((placed.y - reach) / TEXEL) * TEXEL;
        tile = tracer.trace([placed.x, placed.y], placed.flame, [x0, y0, 2 * reach, 2 * reach], null);
        const texels = readUnorm(renderer, tile);
        const w = tile.source.pixelWidth;
        for (let j = 0; j < tile.source.pixelHeight; j += 2) {
          for (let i = 0; i < w; i += 2) {
            const p: P = [x0 + (i + 0.5) * TEXEL, y0 + (j + 0.5) * TEXEL];
            const past = !insidePolygon(p, outline) && distToOutline(p, outline) > 0.01;
            const lit = texels[(j * w + i) * 4]! > 0;
            if (past) {
              result.outside++;
              if (lit) result.litOutside++;
            } else if (lit) result.litInside++;
          }
        }
      } finally {
        tile?.destroy(true);
        tracer.destroy();
        field.destroy();
      }
    }
  } finally {
    renderer.destroy();
  }
  return result;
}

describe('TileTracer', () => {
  it('never lights a texel past the walls of a closed room', async () => {
    const r = await litOutside(false, 12);
    expect(r.rooms).toBeGreaterThanOrEqual(8);
    expect(r.outside).toBeGreaterThan(10_000);
    expect(r.litInside).toBeGreaterThan(1_000);
    expect(r.litOutside).toBe(0);
  });

  it('does light past a wall with a gap (the check can fail)', async () => {
    expect((await litOutside(true, 6)).litOutside).toBeGreaterThan(0);
  });
});

describe('TileCache', () => {
  const light = (key: string, x: number, y: number): EngineLight => ({ key, x, y, bright: 40, dim: 80, flame: 8, color: [1, 1, 1], intensity: 1, animation: 'none' });
  const litAt = (renderer: WebGLRenderer, tile: Tile, at: P): number => {
    const i = Math.floor((at[0] - tile.rect[0]) / TEXEL), j = Math.floor((at[1] - tile.rect[1]) / TEXEL);
    return readUnorm(renderer, tile.texture)[(j * tile.texture.source.pixelWidth + i) * 4]!;
  };

  it('rebuilds only tiles a wall change touches, with the same result as a full rebuild', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1024, 1024], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 1024, height: 1024 });
    const fresh = new TileCache(renderer, field, { width: 1024, height: 1024 });
    try {
      const door = { id: 'd', kind: 'wall' as const, type: 'door' as const, closed: true, p1: { x: 100, y: 0 }, p2: { x: 100, y: 200 } };
      const lights = [light('near', 60, 100), light('far', 800, 800)];
      field.build(splitBlocking([door]).twoWay);
      cache.sync(lights, [door], 'all');
      const farBefore = cache.tiles().get('far')!.texture;
      expect(litAt(renderer, cache.tiles().get('near')!, [140, 100])).toBe(0);
      const opened = [{ ...door, closed: false }];
      field.build(splitBlocking(opened).twoWay);
      expect(cache.sync(lights, opened, [[97, -3, 6, 206]])).toBe(true);
      expect(cache.tiles().get('far')!.texture).toBe(farBefore);
      expect(litAt(renderer, cache.tiles().get('near')!, [140, 100])).toBeGreaterThan(0.5);
      const partial = readUnorm(renderer, cache.tiles().get('near')!.texture);
      fresh.sync(lights, opened, 'all');
      expect(Array.from(partial)).toEqual(Array.from(readUnorm(renderer, fresh.tiles().get('near')!.texture)));
      expect(cache.sync(lights, opened, [])).toBe(false);
    } finally {
      fresh.destroy();
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  it('clips tiles to the map, however far a light shines', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1000, 600], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 1000, height: 600 });
    try {
      field.build([]);
      // A 500 ft light on a 5 ft grid of 70 px: 7,000 px dim, a 16k px tile unclipped.
      const huge = { ...light('huge', 300, 200), bright: 3500, dim: 7000 };
      cache.sync([huge, light('outside', -500, 200)], [], 'all');
      const tile = cache.tiles().get('huge')!;
      expect(tile.rect).toEqual([0, 0, 1000, 600]);
      expect([tile.texture.source.pixelWidth, tile.texture.source.pixelHeight]).toEqual([500, 300]);
      expect(litAt(renderer, tile, [990, 590])).toBeGreaterThan(0.5);
      expect(cache.tiles().has('outside')).toBe(false);
    } finally {
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });

  it('binds a one-way wall only for lights on its blocking side', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1024, 1024], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field, { width: 1024, height: 1024 });
    try {
      const lit = (direction: 'left' | 'right'): number => {
        const wall = { id: 'o', kind: 'wall' as const, type: 'solid' as const, direction, p1: { x: 100, y: 0 }, p2: { x: 100, y: 200 } };
        field.build(splitBlocking([wall]).twoWay);
        cache.sync([light('l', 60, 100)], [wall], 'all');
        return litAt(renderer, cache.tiles().get('l')!, [140, 100]);
      };
      const values = [lit('left'), lit('right')].sort((a, b) => a - b);
      expect(values[0]).toBe(0);
      expect(values[1]).toBeGreaterThan(0.5);
    } finally {
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });
});
