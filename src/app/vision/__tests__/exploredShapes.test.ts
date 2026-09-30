import { describe, expect, it } from 'vitest';
import { exploredShapes } from '../exploredShapes';
import type { LightReach, Sight } from '../sight';

const square = (x: number): { x: number; y: number }[] => [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }];
const sight: Sight = { all: false, polygons: [square(0)], darkvision: [square(1)] };
const torch: LightReach = { origin: { x: 5, y: 5 }, dim: 10, polygon: square(2) };

describe('exploredShapes', () => {
  it('records nothing while no token has vision', () => {
    expect(exploredShapes({ all: true, polygons: [], darkvision: [] }, 0, [torch])).toBeNull();
  });

  it('records the whole line of sight when the scene is lit', () => {
    expect(exploredShapes(sight, 0.5, [torch])).toEqual({ polygons: sight.polygons, clip: null });
  });

  it('records only lit and darkvision areas, clipped to sight, in the dark', () => {
    expect(exploredShapes(sight, 0, [torch])).toEqual({ polygons: [torch.polygon, ...sight.darkvision], clip: sight.polygons });
  });

  it('records nothing in the dark without light or darkvision', () => {
    expect(exploredShapes({ ...sight, darkvision: [] }, 0, [])).toBeNull();
  });
});
