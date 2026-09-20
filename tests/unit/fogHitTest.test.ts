import { describe, it, expect } from 'vitest';
import { hitTestFogOp, findConnectedFogOps } from '../../src/app/pixi/fog/fogHitTest';
import type {
  FogBrushStroke,
  FogLassoFill,
  FogOperation,
  FogRectangleFill,
} from '../../src/app/types/fogTypes';

// ── helpers ──────────────────────────────────────────────────────────────

function makeBrush(overrides: Partial<FogBrushStroke> = {}): FogBrushStroke {
  return {
    id: 'b1',
    kind: 'fog',
    timestamp: 1,
    isErasing: false,
    type: 'brush',
    brushRadius: 10,
    points: [{ x: 50, y: 50 }],
    ...overrides,
  };
}

function makeLasso(overrides: Partial<FogLassoFill> = {}): FogLassoFill {
  return {
    id: 'l1',
    kind: 'fog',
    timestamp: 1,
    isErasing: false,
    type: 'lasso',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    ...overrides,
  };
}

function makeRect(overrides: Partial<FogRectangleFill> = {}): FogRectangleFill {
  return {
    id: 'r1',
    kind: 'fog',
    timestamp: 1,
    isErasing: false,
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    ...overrides,
  };
}

// ── Brush hit testing ────────────────────────────────────────────────────

describe('hitTestFogOp – brush', () => {
  it('returns true for a point inside the brush radius', () => {
    const brush = makeBrush();
    expect(hitTestFogOp(50, 50, brush, [brush])).toBe(true);
  });

  it('returns true for a point at the edge of the radius', () => {
    const brush = makeBrush();
    expect(hitTestFogOp(60, 50, brush, [brush])).toBe(true);
  });

  it('returns false for a point outside the brush radius', () => {
    const brush = makeBrush();
    expect(hitTestFogOp(70, 50, brush, [brush])).toBe(false);
  });

  it('handles multi-point brush strokes (segment proximity)', () => {
    const brush = makeBrush({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    // midpoint of segment, within radius
    expect(hitTestFogOp(50, 5, brush, [brush])).toBe(true);
    // far from segment
    expect(hitTestFogOp(50, 25, brush, [brush])).toBe(false);
  });

  it('returns false for empty points array', () => {
    const brush = makeBrush({ points: [] });
    expect(hitTestFogOp(50, 50, brush, [brush])).toBe(false);
  });

  it('applies offsetX / offsetY', () => {
    const brush = makeBrush({
      points: [{ x: 50, y: 50 }],
      offsetX: 20,
      offsetY: 20,
    });
    // shifted to (70, 70) — hit at new position
    expect(hitTestFogOp(70, 70, brush, [brush])).toBe(true);
    // original position is now outside
    expect(hitTestFogOp(50, 50, brush, [brush])).toBe(false);
  });
});

// ── Lasso hit testing ────────────────────────────────────────────────────

describe('hitTestFogOp – lasso', () => {
  it('returns true for a point inside the polygon', () => {
    const lasso = makeLasso();
    expect(hitTestFogOp(50, 50, lasso, [lasso])).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    const lasso = makeLasso();
    expect(hitTestFogOp(150, 50, lasso, [lasso])).toBe(false);
  });

  it('returns false for fewer than 3 points (degenerate polygon)', () => {
    const lasso = makeLasso({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    expect(hitTestFogOp(50, 0, lasso, [lasso])).toBe(false);
  });

  it('applies offsetX / offsetY', () => {
    const lasso = makeLasso({ offsetX: 200, offsetY: 200 });
    expect(hitTestFogOp(250, 250, lasso, [lasso])).toBe(true);
    expect(hitTestFogOp(50, 50, lasso, [lasso])).toBe(false);
  });
});

// ── Rectangle hit testing ────────────────────────────────────────────────

describe('hitTestFogOp – rectangle', () => {
  it('returns true for a point inside the rectangle', () => {
    const rect = makeRect();
    expect(hitTestFogOp(50, 50, rect, [rect])).toBe(true);
  });

  it('returns true on the boundary', () => {
    const rect = makeRect();
    expect(hitTestFogOp(0, 0, rect, [rect])).toBe(true);
    expect(hitTestFogOp(100, 100, rect, [rect])).toBe(true);
  });

  it('returns false outside the rectangle', () => {
    const rect = makeRect();
    expect(hitTestFogOp(101, 50, rect, [rect])).toBe(false);
  });

  it('applies offsetX / offsetY', () => {
    const rect = makeRect({ offsetX: 50, offsetY: 50 });
    expect(hitTestFogOp(75, 75, rect, [rect])).toBe(true);
    expect(hitTestFogOp(10, 10, rect, [rect])).toBe(false);
  });
});

// ── Erase interaction ────────────────────────────────────────────────────

describe('hitTestFogOp – erase logic', () => {
  it('returns false when testing an erase op directly', () => {
    const eraser = makeRect({ isErasing: true });
    expect(hitTestFogOp(50, 50, eraser, [eraser])).toBe(false);
  });

  it('returns false when a later erase covers the paint op', () => {
    const paint = makeRect({ id: 'p1', timestamp: 1 });
    const eraser = makeRect({ id: 'e1', timestamp: 2, isErasing: true });
    expect(hitTestFogOp(50, 50, paint, [paint, eraser])).toBe(false);
  });

  it('returns true when erase timestamp is earlier than paint', () => {
    const eraser = makeRect({ id: 'e1', timestamp: 1, isErasing: true });
    const paint = makeRect({ id: 'p1', timestamp: 2 });
    expect(hitTestFogOp(50, 50, paint, [eraser, paint])).toBe(true);
  });

  it('partial erase only blocks the erased region', () => {
    const paint = makeLasso({ id: 'p1', timestamp: 1 });
    const eraser = makeRect({
      id: 'e1',
      timestamp: 2,
      isErasing: true,
      x: 60,
      y: 0,
      width: 100,
      height: 100,
    });
    // (30, 50) is inside paint but NOT in erased region
    expect(hitTestFogOp(30, 50, paint, [paint, eraser])).toBe(true);
    // (80, 50) is inside both paint and eraser → blocked
    expect(hitTestFogOp(80, 50, paint, [paint, eraser])).toBe(false);
  });
});

// ── Connected fog ops (merge detection) ─────────────────────────────

describe('findConnectedFogOps – brush overlap', () => {
  it('groups two overlapping brush strokes', () => {
    const a = makeBrush({
      id: 'a',
      brushRadius: 20,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    });
    const b = makeBrush({
      id: 'b',
      brushRadius: 20,
      points: [{ x: 50, y: 10 }, { x: 50, y: 100 }],
    });
    const group = findConnectedFogOps('a', [a, b]);
    expect(group).toContain('a');
    expect(group).toContain('b');
    expect(group).toHaveLength(2);
  });

  it('does not group non-overlapping brush strokes', () => {
    const a = makeBrush({
      id: 'a',
      brushRadius: 10,
      points: [{ x: 0, y: 0 }],
    });
    const b = makeBrush({
      id: 'b',
      brushRadius: 10,
      points: [{ x: 200, y: 200 }],
    });
    const group = findConnectedFogOps('a', [a, b]);
    expect(group).toEqual(['a']);
  });

  it('finds transitive connections (A–B–C)', () => {
    const a = makeBrush({
      id: 'a',
      brushRadius: 15,
      points: [{ x: 0, y: 0 }, { x: 30, y: 0 }],
    });
    const b = makeBrush({
      id: 'b',
      brushRadius: 15,
      points: [{ x: 25, y: 0 }, { x: 60, y: 0 }],
    });
    const c = makeBrush({
      id: 'c',
      brushRadius: 15,
      points: [{ x: 55, y: 0 }, { x: 90, y: 0 }],
    });
    // A overlaps B, B overlaps C, but A doesn't directly overlap C
    const group = findConnectedFogOps('a', [a, b, c]);
    expect(group).toHaveLength(3);
    expect(group).toContain('a');
    expect(group).toContain('b');
    expect(group).toContain('c');
  });
});

describe('findConnectedFogOps – mixed shapes', () => {
  it('groups a brush overlapping a rectangle', () => {
    const brush = makeBrush({
      id: 'brush1',
      brushRadius: 20,
      points: [{ x: 90, y: 50 }],
    });
    const rect = makeRect({ id: 'rect1', x: 0, y: 0, width: 100, height: 100 });
    const group = findConnectedFogOps('brush1', [brush, rect]);
    expect(group).toContain('brush1');
    expect(group).toContain('rect1');
  });

  it('groups a lasso overlapping a rectangle', () => {
    const lasso = makeLasso({
      id: 'lasso1',
      points: [
        { x: 80, y: 20 },
        { x: 150, y: 20 },
        { x: 150, y: 80 },
        { x: 80, y: 80 },
      ],
    });
    const rect = makeRect({ id: 'rect1', x: 0, y: 0, width: 100, height: 100 });
    const group = findConnectedFogOps('lasso1', [lasso, rect]);
    expect(group).toContain('lasso1');
    expect(group).toContain('rect1');
  });

  it('returns single ID when only one op exists', () => {
    const brush = makeBrush({ id: 'solo' });
    expect(findConnectedFogOps('solo', [brush])).toEqual(['solo']);
  });

  it('does not group paint regions connected only through an area erased later', () => {
    const left = makeRect({
      id: 'left',
      timestamp: 1,
      x: 0,
      y: 0,
      width: 120,
      height: 100,
    });
    const right = makeRect({
      id: 'right',
      timestamp: 2,
      x: 80,
      y: 0,
      width: 120,
      height: 100,
    });
    const eraseBridge = makeRect({
      id: 'erase',
      timestamp: 3,
      isErasing: true,
      x: 80,
      y: 0,
      width: 40,
      height: 100,
    });
    const group = findConnectedFogOps('left', [left, right], [left, right, eraseBridge]);
    expect(group).toEqual(['left']);
  });
});
