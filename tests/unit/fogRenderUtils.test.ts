import { describe, it, expect } from 'vitest';
import { calculateOperationBounds } from '../../src/app/pixi/fog/fogRenderUtils';
import type {
  FogBrushStroke,
  FogLassoFill,
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
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 120 },
      { x: 10, y: 120 },
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
    x: 10,
    y: 20,
    width: 200,
    height: 150,
    ...overrides,
  };
}

// ── Brush bounds ─────────────────────────────────────────────────────────

describe('calculateOperationBounds – brush', () => {
  it('returns bounds padded by brushRadius for a single point', () => {
    const b = calculateOperationBounds(makeBrush());
    expect(b).toEqual({ x: 40, y: 40, width: 20, height: 20 });
  });

  it('returns bounds spanning all points + brushRadius', () => {
    const b = calculateOperationBounds(
      makeBrush({
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 80 },
        ],
        brushRadius: 5,
      }),
    );
    expect(b).toEqual({ x: -5, y: -5, width: 110, height: 90 });
  });

  it('applies offsetX / offsetY to position', () => {
    const b = calculateOperationBounds(makeBrush({ offsetX: 30, offsetY: 40 }));
    expect(b.x).toBe(70);
    expect(b.y).toBe(80);
  });

  it('returns zero bounds for empty points', () => {
    const b = calculateOperationBounds(makeBrush({ points: [] }));
    expect(b).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

// ── Lasso bounds ─────────────────────────────────────────────────────────

describe('calculateOperationBounds – lasso', () => {
  it('returns tight bounds around polygon vertices', () => {
    const b = calculateOperationBounds(makeLasso());
    expect(b).toEqual({ x: 10, y: 20, width: 100, height: 100 });
  });

  it('applies offset', () => {
    const b = calculateOperationBounds(makeLasso({ offsetX: 5, offsetY: 10 }));
    expect(b.x).toBe(15);
    expect(b.y).toBe(30);
  });

  it('returns zero bounds for empty points', () => {
    const b = calculateOperationBounds(makeLasso({ points: [] }));
    expect(b).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

// ── Rectangle bounds ─────────────────────────────────────────────────────

describe('calculateOperationBounds – rectangle', () => {
  it('returns exact rectangle dimensions', () => {
    const b = calculateOperationBounds(makeRect());
    expect(b).toEqual({ x: 10, y: 20, width: 200, height: 150 });
  });

  it('applies offset', () => {
    const b = calculateOperationBounds(makeRect({ offsetX: -10, offsetY: -20 }));
    expect(b).toEqual({ x: 0, y: 0, width: 200, height: 150 });
  });
});

// ── Unknown type ─────────────────────────────────────────────────────────

describe('calculateOperationBounds – unknown type', () => {
  it('returns zero bounds for unknown operation types', () => {
    const unknown = { type: 'mystery' } as any;
    const b = calculateOperationBounds(unknown);
    expect(b).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
