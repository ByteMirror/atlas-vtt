import { describe, it, expect } from 'vitest';
import { splitStrokeByBrush } from '../../src/app/pixi/drawingEraseUtils';

// Horizontal stroke along y=0 from x=0 to x=100, one point every 10px.
const line = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0 }));

describe('splitStrokeByBrush', () => {
  it('returns null when the brush misses the stroke', () => {
    expect(splitStrokeByBrush(line, { x: 50, y: 500 }, 20)).toBeNull();
  });

  it('splits a stroke into two fragments when erasing the middle', () => {
    const fragments = splitStrokeByBrush(line, { x: 50, y: 0 }, 15);
    expect(fragments).not.toBeNull();
    expect(fragments).toHaveLength(2);
    // Points within 15px of x=50 (40, 50, 60) are gone
    expect(fragments![0].map(p => p.x)).toEqual([0, 10, 20, 30]);
    expect(fragments![1].map(p => p.x)).toEqual([70, 80, 90, 100]);
  });

  it('trims an end without splitting', () => {
    const fragments = splitStrokeByBrush(line, { x: 100, y: 0 }, 25);
    expect(fragments).toHaveLength(1);
    expect(fragments![0].map(p => p.x)).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
  });

  it('erases the whole stroke when the brush covers it', () => {
    expect(splitStrokeByBrush(line, { x: 50, y: 0 }, 200)).toEqual([]);
  });

  it('drops fragments too short to draw', () => {
    // Leaves only x=0 on the left — a single point, not a renderable line
    const fragments = splitStrokeByBrush(line, { x: 55, y: 0 }, 50);
    expect(fragments).toEqual([]);
  });

  it('leaves points outside the brush untouched', () => {
    const fragments = splitStrokeByBrush(line, { x: 0, y: 0 }, 5);
    expect(fragments![0][0]).toEqual({ x: 10, y: 0 });
  });
});
