import { describe, expect, it } from 'vitest';
import { wallRadius } from '../../../../lighting/lightingConstants';
import { CapsuleField } from '../CapsuleField';
import { TileTracer } from '../TileTracer';
import { createTestRenderer, readUnorm } from './gpuTestUtils';

const TEXEL = 2;
const SIZE = 1024;

describe('tile smoothing', () => {
  it('turns the ray steps of an open-space penumbra into a smooth ramp and keeps the umbra black', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, SIZE, SIZE], TEXEL, wallRadius(TEXEL));
    const tracer = new TileTracer(renderer, field);
    try {
      // The wall's top end at (200, 450) casts a wide penumbra across x = 800, 600 px from any wall.
      field.build([[200, 450, 200, 1100]]);
      const tile = tracer.trace([100, 400], 40, [0, 0, SIZE, SIZE], null);
      const texels = readUnorm(renderer, tile);
      const width = tile.source.pixelWidth;
      tile.destroy(true);
      const at = (x: number, y: number): number => texels[(Math.floor(y / TEXEL) * width + Math.floor(x / TEXEL)) * 4]!;
      const profile = Array.from({ length: 300 }, (_, j) => at(800, 400 + j * TEXEL));
      expect(profile[0]).toBeGreaterThan(0.95);
      expect(profile[profile.length - 1]).toBeLessThan(0.05);
      const steps = profile.slice(1).map((v, j) => Math.abs(v - profile[j]!));
      expect(Math.max(...steps)).toBeLessThanOrEqual(0.01);
      // Right behind the wall, deep in its shadow.
      for (let x = 206; x < 260; x += TEXEL) expect(at(x, 900)).toBe(0);
    } finally {
      tracer.destroy();
      field.destroy();
      renderer.destroy();
    }
  });
});
