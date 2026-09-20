import { describe, it, expect } from 'vitest';
import { hitTestDrawing, getDrawingBounds } from '../../src/app/pixi/drawingGeometry';
import type { DrawingStroke } from '../../src/app/types';

const base = { id: 'drawing_1', kind: 'drawing', timestamp: 0, color: '#fff', opacity: 1 } as const;
const line: DrawingStroke = { ...base, type: 'pen', width: 4, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
const icon: DrawingStroke = { ...base, type: 'icon', icon: 'door-open', width: 70, points: [{ x: 200, y: 200 }] };

describe('hitTestDrawing', () => {
  it('hits ink between recorded points, not only at them', () => {
    expect(hitTestDrawing(line, { x: 50, y: 5 }, 4)).toBe(true);
  });

  it('misses ink beyond half width plus tolerance', () => {
    expect(hitTestDrawing(line, { x: 50, y: 7 }, 4)).toBe(false);
    expect(hitTestDrawing(line, { x: 110, y: 0 }, 4)).toBe(false);
  });

  it('hits an icon anywhere in its footprint', () => {
    expect(hitTestDrawing(icon, { x: 234, y: 166 }, 0)).toBe(true);
    expect(hitTestDrawing(icon, { x: 236, y: 200 }, 0)).toBe(false);
  });
});

describe('getDrawingBounds', () => {
  it('pads ink by half its width', () => {
    expect(getDrawingBounds(line)).toEqual({ x: -2, y: -2, width: 104, height: 4 });
  });

  it('covers the icon footprint', () => {
    expect(getDrawingBounds(icon)).toEqual({ x: 165, y: 165, width: 70, height: 70 });
  });
});
