import { describe, expect, it } from 'vitest';
import { extractConnectedComponentRects } from '../../src/app/pixi/fog/fogComponentDelete';

function buildMask(width: number, height: number, on: Array<{ x: number; y: number }>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const p of on) {
    mask[p.y * width + p.x] = 1;
  }
  return mask;
}

describe('extractConnectedComponentRects', () => {
  it('returns only the clicked connected component when two blobs are separated', () => {
    const on: Array<{ x: number; y: number }> = [];
    for (let y = 1; y <= 4; y++) {
      for (let x = 1; x <= 3; x++) on.push({ x, y });
      for (let x = 6; x <= 8; x++) on.push({ x, y });
    }
    const mask = buildMask(10, 6, on);
    const rects = extractConnectedComponentRects(mask, 10, 6, 2, 2);

    expect(rects).toEqual([{ x: 1, y: 1, width: 3, height: 4 }]);
  });

  it('returns empty when seed pixel is not part of fog', () => {
    const mask = buildMask(6, 4, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
    expect(extractConnectedComponentRects(mask, 6, 4, 5, 3)).toEqual([]);
  });
});

