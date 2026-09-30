import { describe, expect, it } from 'vitest';
import { computeVisibility, pointInPolygon } from '../visibility';
import { sightWedges } from '../sightWedges';
import type { WallSegment } from '../../types/wallTypes';

const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 50, y: -40 }, p2: { x: 50, y: 40 } };

describe('sightWedges', () => {
  it('puts one wedge at each end of a wall, opening into what is seen', () => {
    const origin = { x: 0, y: 0 };
    const polygon = computeVisibility(origin, 400, [wall]);
    const wedges = sightWedges(origin, polygon, 20);
    expect(wedges).toHaveLength(2);
    for (const wedge of wedges) {
      expect(Math.hypot(wedge.a.x - 50, Math.abs(wedge.a.y) - 40)).toBeLessThan(1e-3);
      const inside = rotate(wedge.e, wedge.side * wedge.phi * 0.5);
      expect(pointInPolygon({ x: wedge.a.x + inside.x * 100, y: wedge.a.y + inside.y * 100 }, polygon)).toBe(true);
      const outside = rotate(wedge.e, -wedge.side * wedge.phi * 0.5);
      expect(pointInPolygon({ x: wedge.a.x + outside.x * 100, y: wedge.a.y + outside.y * 100 }, polygon)).toBe(false);
    }
  });
});

function rotate(v: { x: number; y: number }, angle: number): { x: number; y: number } {
  return { x: v.x * Math.cos(angle) - v.y * Math.sin(angle), y: v.x * Math.sin(angle) + v.y * Math.cos(angle) };
}
