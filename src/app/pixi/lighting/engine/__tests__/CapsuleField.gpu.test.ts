import { describe, expect, it } from 'vitest';
import { CapsuleField } from '../CapsuleField';
import { distToSeg, type Seg } from '../../../../lighting/segments';
import { FIELD_MAX } from '../../../../lighting/lightingConstants';
import { createTestRenderer, readFloats } from './gpuTestUtils';

describe('CapsuleField', () => {
  it('stores the exact distance to the nearest wall at texel centres, clamped', async () => {
    const renderer = await createTestRenderer(64);
    const first: Seg = [40, 40, 200, 60];
    const last: Seg = [200, 60, 120, 220];
    const walls: Seg[] = [first, last];
    const field = new CapsuleField(renderer, [0, 0, 256, 256], 2, 3);
    try {
      field.build(walls);
      const texels = readFloats(renderer, field.texture);
      const width = field.texture.source.pixelWidth;
      let nearestIsNotLast = 0;
      for (const [i, j] of [[10, 10], [60, 30], [100, 100], [127, 127], [5, 120]] as const) {
        const x = (i + 0.5) * 2;
        const y = (j + 0.5) * 2;
        const expected = Math.min(FIELD_MAX, ...walls.map((w) => distToSeg(x, y, w)));
        const lastWall = Math.min(FIELD_MAX, distToSeg(x, y, last));
        if (lastWall - expected > 1) nearestIsNotLast++;
        expect(texels[(j * width + i) * 4]).toBeCloseTo(expected, 0);
      }
      // Overwrite blending would keep the last wall drawn; these probes must tell it from min.
      expect(nearestIsNotLast).toBeGreaterThan(0);
    } finally {
      field.destroy();
      renderer.destroy();
    }
  });

  it('is empty (all FIELD_MAX) without walls', async () => {
    const renderer = await createTestRenderer(64);
    const field = new CapsuleField(renderer, [0, 0, 64, 64], 2, 3);
    try {
      field.build([]);
      const texels = readFloats(renderer, field.texture);
      expect(Array.from(texels).filter((_, i) => i % 4 === 0).every((v) => v === FIELD_MAX)).toBe(true);
    } finally {
      field.destroy();
      renderer.destroy();
    }
  });
});
