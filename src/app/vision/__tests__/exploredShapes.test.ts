import { describe, expect, it } from 'vitest';
import { exploredShapes } from '../exploredShapes';
import type { LightReach, Sight } from '../sight';

const square = (x: number): { x: number; y: number }[] => [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }];
const sight: Sight = { all: false, polygons: [square(0)], origins: [{ x: 0, y: 0 }], apexes: [0], darkvision: [square(1)], darkvisionOrigins: [{ x: 0, y: 0 }], darkvisionApexes: [0], tremors: [] };
const torch: LightReach = { origin: { x: 5, y: 5 }, dim: 10, polygon: square(2) };

describe('exploredShapes', () => {
  it('records nothing while no token has vision', () => {
    expect(exploredShapes({ all: true, polygons: [], origins: [], apexes: [], darkvision: [], darkvisionOrigins: [], darkvisionApexes: [], tremors: [] }, { ambient: 0 }, [torch])).toBeNull();
  });

  it('records the whole line of sight when the scene is lit', () => {
    expect(exploredShapes(sight, { ambient: 0.5 }, [torch])).toEqual({ polygons: sight.polygons, clip: null });
  });

  it('records only lit and darkvision areas, clipped to sight, in the dark', () => {
    expect(exploredShapes(sight, { ambient: 0 }, [torch])).toEqual({ polygons: [torch.polygon, ...sight.darkvision], clip: sight.polygons });
  });

  it('records nothing in the dark without light or darkvision', () => {
    expect(exploredShapes({ ...sight, darkvision: [], darkvisionOrigins: [], tremors: [] }, { ambient: 0 }, [])).toBeNull();
  });

  it('counts the scene as lit from its own threshold', () => {
    expect(exploredShapes(sight, { ambient: 0.3, litThreshold: 0.5 }, [torch])).toEqual({ polygons: [torch.polygon, ...sight.darkvision], clip: sight.polygons });
    expect(exploredShapes(sight, { ambient: 0.5, litThreshold: 0.5 }, [torch])).toEqual({ polygons: sight.polygons, clip: null });
    expect(exploredShapes(sight, { ambient: 0, litThreshold: 0 }, [])).toEqual({ polygons: sight.polygons, clip: null });
  });

  it('records nothing while the scene remembers no explored areas', () => {
    expect(exploredShapes(sight, { ambient: 1, exploredMemory: false }, [torch])).toBeNull();
    expect(exploredShapes(sight, { ambient: 0, exploredMemory: false }, [torch])).toBeNull();
    expect(exploredShapes(sight, { ambient: 1, exploredMemory: true }, [torch])).toEqual({ polygons: sight.polygons, clip: null });
  });
});
