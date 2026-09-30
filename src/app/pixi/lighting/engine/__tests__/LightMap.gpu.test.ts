import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { LightMap } from '../LightMap';
import { createTarget, renderInto } from '../gpu';
import type { Tile } from '../TileCache';
import { createTestRenderer, readFloats, readUnorm } from './gpuTestUtils';

describe('LightMap', () => {
  it('gives half the light at the bright radius, zero past the reach and follows the tile', async () => {
    const renderer = await createTestRenderer(64);
    const map = new LightMap(renderer, { width: 512, height: 512 }, 2);
    const tileTexture = createTarget(200, 200, 'r8unorm', 'nearest');
    try {
      renderInto(renderer, new Container(), tileTexture, [1, 0, 0, 1]);
      expect(readUnorm(renderer, tileTexture)[0]).toBe(1);
      const tile: Tile = { x: 200, y: 200, flame: 5, rect: [0, 0, 400, 400], texture: tileTexture };
      map.draw([{ tile, bright: 40, reach: 150, color: [1, 1, 1], intensity: 1 }]);
      const texels = readFloats(renderer, map.texture);
      const at = (x: number, y: number): number => texels[(Math.floor(y / 2) * map.texture.source.pixelWidth + Math.floor(x / 2)) * 4]!;
      expect(at(241, 201)).toBeCloseTo(0.5 * (1 - (41 / 150) ** 4) ** 2, 1);
      expect(at(360, 201)).toBe(0);
      expect(at(200, 450)).toBe(0);
    } finally {
      map.destroy();
      tileTexture.destroy(true);
      renderer.destroy();
    }
  });

  it('clears to black with no lights', async () => {
    const renderer = await createTestRenderer(64);
    const map = new LightMap(renderer, { width: 64, height: 64 }, 2);
    try {
      map.draw([]);
      expect(Array.from(readFloats(renderer, map.texture)).every((v, i) => i % 4 === 3 || v === 0)).toBe(true);
    } finally {
      map.destroy();
      renderer.destroy();
    }
  });
});
