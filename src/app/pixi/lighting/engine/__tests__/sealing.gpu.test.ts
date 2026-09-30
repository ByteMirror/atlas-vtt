import { describe, expect, it } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { TileCache } from '../TileCache';
import { sealedWalls } from '../../../../lighting/sealWalls';
import { splitBlocking } from '../../../../lighting/segments';
import { wallRadius } from '../../../../lighting/lightingConstants';
import { computeVisibility, pointInPolygon } from '../../../../vision/visibility';
import type { WallSegment } from '../../../../types/wallTypes';
import type { EngineLight } from '../types';
import { createTestRenderer, readUnorm } from './gpuTestUtils';

const TEXEL = 2;
const LIGHT = { x: 500, y: 500 };

function wall(id: string, x1: number, y1: number, x2: number, y2: number): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } };
}

/** A closed box around the light whose top wall is split by a `gap` px opening above it. */
function room(gap: number): WallSegment[] {
  return [
    wall('left-top', 100, 300, 500 - gap / 2, 300), wall('right-top', 500 + gap / 2, 300, 900, 300),
    wall('right', 900, 300, 900, 700), wall('bottom', 900, 700, 100, 700), wall('left', 100, 700, 100, 300),
  ];
}

/** Points above the gap, well past the wall. */
const PAST = Array.from({ length: 11 }, (_, i) => ({ x: 495 + i, y: 270 }));

describe('sealing', () => {
  it('closes a gap for light exactly when it closes it for sight', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 1024, 1024], TEXEL, wallRadius(TEXEL));
    const cache = new TileCache(renderer, field);
    const light: EngineLight = { key: 'l', x: LIGHT.x, y: LIGHT.y, bright: 150, dim: 300, flame: 8, color: [1, 1, 1], intensity: 1, animation: 'none' };
    try {
      const results: Record<number, { light: boolean; sight: boolean }> = {};
      for (const gap of [4, 8, 12, 20]) {
        const walls = sealedWalls(room(gap), TEXEL);
        field.build(splitBlocking(walls).twoWay);
        cache.sync([light], walls, 'all');
        const tile = cache.tiles().get('l')!;
        const texels = readUnorm(renderer, tile.texture);
        const width = tile.texture.source.pixelWidth;
        const lit = PAST.some((p) => {
          const i = Math.floor((p.x - tile.rect[0]) / TEXEL), j = Math.floor((p.y - tile.rect[1]) / TEXEL);
          return texels[(j * width + i) * 4]! > 0;
        });
        const polygon = computeVisibility(LIGHT, 1000, walls);
        const seen = PAST.some((p) => pointInPolygon(p, polygon));
        results[gap] = { light: lit, sight: seen };
      }
      expect(results).toEqual({
        4: { light: false, sight: false },
        8: { light: false, sight: false },
        12: { light: false, sight: false },
        20: { light: true, sight: true },
      });
    } finally {
      cache.destroy();
      field.destroy();
      renderer.destroy();
    }
  });
});
