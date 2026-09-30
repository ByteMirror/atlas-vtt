import { describe, expect, it } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { LightMap } from '../LightMap';
import { TileCache } from '../TileCache';
import { RadianceCascades } from '../RadianceCascades';
import { BOUNCE, wallRadius } from '../../../../lighting/lightingConstants';
import { splitBlocking } from '../../../../lighting/segments';
import { createTestRenderer, readFloats } from './gpuTestUtils';
import type { WallSegment } from '../../../../types/wallTypes';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });

describe('RadianceCascades', () => {
  it('bounces light into a lit room and none into the closed room beside it', async () => {
    const renderer = await createTestRenderer(64);
    const bounds = { width: 1024, height: 512 };
    // Two rooms sharing the wall x = 512; the light is in the left one.
    const walls = [wall('t', 32, 32, 992, 32), wall('b', 32, 480, 992, 480), wall('l', 32, 32, 32, 480), wall('r', 992, 32, 992, 480), wall('m', 512, 32, 512, 480)];
    const field = new CapsuleField(renderer, [0, 0, bounds.width, bounds.height], 2, wallRadius(2));
    const tiles = new TileCache(renderer, field);
    const map = new LightMap(renderer, bounds, 2);
    const cascades = new RadianceCascades(renderer, bounds, field);
    try {
      field.build(splitBlocking(walls).twoWay);
      tiles.sync([{ key: 'l', x: 200, y: 256, bright: 120, dim: 240, flame: 20, color: [1, 1, 1], intensity: 1, animation: 'none' }], walls, 'all');
      const tile = tiles.tiles().get('l')!;
      map.draw([{ tile, bright: 120, reach: 240 * 1.12, color: [1, 1, 1], intensity: 1 }]);
      cascades.build(map, null, field);
      const probes = readFloats(renderer, cascades.fluence);
      const width = cascades.fluence.source.pixelWidth;
      const probe = (x: number, y: number): number => probes[(Math.floor(y / BOUNCE.probe) * width + Math.floor(x / BOUNCE.probe)) * 4]!;
      expect(probe(420, 256)).toBeGreaterThan(0);
      for (let x = 530; x < 980; x += 16) for (let y = 48; y < 470; y += 16) expect(probe(x, y)).toBe(0);
    } finally {
      cascades.destroy();
      map.destroy();
      tiles.destroy();
      field.destroy();
      renderer.destroy();
    }
  });
});
