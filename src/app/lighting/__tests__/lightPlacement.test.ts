import { describe, expect, it } from 'vitest';
import { placeLight } from '../lightPlacement';
import { crosses, distToSeg, type Seg } from '../segments';
import { fieldMargin, wallRadius } from '../lightingConstants';

const texel = 2;
const need = wallRadius(texel) + fieldMargin(texel) + 1.5;

describe('placeLight', () => {
  it('leaves a light in open space where it is', () => {
    expect(placeLight(50, 50, 10, [[0, 0, 100, 0]], texel)).toEqual({ x: 50, y: 50, flame: 10 });
  });

  it('moves a light standing on a wall off it, to the side it stands on', () => {
    const wall: Seg = [0, 0, 100, 0];
    const placed = placeLight(50, 0.3, 10, [wall], texel)!;
    expect(placed.y).toBeGreaterThan(0);
    expect(distToSeg(placed.x, placed.y, wall)).toBeGreaterThanOrEqual(need - 1e-6);
  });

  it('never moves a light through the tip of a narrow wall spike (fuzz case)', () => {
    // Seed 11, trial 3 of the spike: a light 0.5 px inside an acute spike's tip.
    const walls: Seg[] = [[698.733, 986.449, 949.12, 740.726], [949.12, 740.726, 681.754, 1041.131]];
    const placed = placeLight(948.764, 741.078, 30, walls, texel);
    if (placed) for (const w of walls) expect(crosses(948.764, 741.078, placed.x, placed.y, w)).toBe(false);
  });

  it('clamps the flame to the free space around the light', () => {
    const placed = placeLight(50, 20, 40, [[0, 0, 100, 0]], texel)!;
    expect(placed.flame).toBeLessThanOrEqual(20 - wallRadius(texel) - fieldMargin(texel));
  });

  it('gives up in a pocket too small to stand in', () => {
    const pocket: Seg[] = [[0, 0, 4, 0], [4, 0, 2, 3], [2, 3, 0, 0]];
    expect(placeLight(2, 1, 5, pocket, texel)).toBeNull();
  });
});
