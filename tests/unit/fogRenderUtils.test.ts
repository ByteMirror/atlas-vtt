import { describe, it, expect } from 'vitest';
import { calculateOperationBounds, renderCells, renderOperation } from '../../src/app/pixi/fog/fogRenderUtils';
import type {
  FogBrushStroke,
  FogCellFill,
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

// ── Grid cell bounds ─────────────────────────────────────────────────────

function makeCells(overrides: Partial<FogCellFill> = {}): FogCellFill {
  return {
    id: 'c1',
    kind: 'fog',
    timestamp: 1,
    isErasing: false,
    type: 'cells',
    cells: [[
      { x: 0, y: 0 },
      { x: 70, y: 0 },
      { x: 70, y: 70 },
      { x: 0, y: 70 },
    ]],
    ...overrides,
  };
}

describe('calculateOperationBounds – cells', () => {
  it('returns the cell outline for a single filled unit', () => {
    const b = calculateOperationBounds(makeCells());
    expect(b).toEqual({ x: 0, y: 0, width: 70, height: 70 });
  });

  it('spans every cell of a multi-unit fill', () => {
    const b = calculateOperationBounds(makeCells({
      cells: [
        [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }],
        [{ x: 70, y: 70 }, { x: 140, y: 70 }, { x: 140, y: 140 }, { x: 70, y: 140 }],
      ],
    }));
    expect(b).toEqual({ x: 0, y: 0, width: 140, height: 140 });
  });

  it('applies offset', () => {
    const b = calculateOperationBounds(makeCells({ offsetX: 5, offsetY: -5 }));
    expect(b).toEqual({ x: 5, y: -5, width: 70, height: 70 });
  });

  it('returns zero bounds when no cells were filled', () => {
    expect(calculateOperationBounds(makeCells({ cells: [] })))
      .toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

// ── Grid cell rendering ──────────────────────────────────────────────────

/** Records the path calls a renderer makes, standing in for a Canvas 2D context. */
function recordingContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const round = (n: number): string => (Math.round(n * 1000) / 1000).toString();
  const ctx = {
    // Deliberately not a value the renderer would pick, so the assertions see a real write.
    globalCompositeOperation: 'xor',
    fillStyle: '',
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    closePath: () => calls.push('closePath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${round(x)},${round(y)})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${round(x)},${round(y)})`),
    fill: () => calls.push('fill'),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const ORIGIN_BOUNDS = { x: 0, y: 0, width: 1000, height: 1000 };

describe('renderCells', () => {
  it('traces the cell in canvas space and fills once', () => {
    const { ctx, calls } = recordingContext();
    renderCells(ctx, makeCells(), ORIGIN_BOUNDS, 0.5, 0, 0);
    expect(calls).toEqual([
      'beginPath',
      'moveTo(0,0)',
      'lineTo(35,0)',
      'lineTo(35,35)',
      'lineTo(0,35)',
      'closePath',
      'fill',
    ]);
  });

  it('subtracts the bounds origin and applies the drag offset', () => {
    const { ctx, calls } = recordingContext();
    renderCells(ctx, makeCells({ offsetX: 10, offsetY: 20 }), { x: 100, y: 200, width: 1000, height: 1000 }, 1, 10, 20);
    expect(calls[1]).toBe('moveTo(-90,-180)');
  });

  it('fills neighbouring cells as subpaths of one path, so they merge without a seam', () => {
    const { ctx, calls } = recordingContext();
    renderCells(ctx, makeCells({
      cells: [
        [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }],
        [{ x: 70, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 70 }, { x: 70, y: 70 }],
      ],
    }), ORIGIN_BOUNDS, 1, 0, 0);
    expect(calls.filter((c) => c === 'beginPath')).toHaveLength(1);
    expect(calls.filter((c) => c === 'closePath')).toHaveLength(2);
    expect(calls.filter((c) => c === 'fill')).toHaveLength(1);
  });

  it('skips degenerate cells and fills nothing when none are left', () => {
    const { ctx, calls } = recordingContext();
    renderCells(ctx, makeCells({ cells: [[{ x: 0, y: 0 }, { x: 70, y: 0 }]] }), ORIGIN_BOUNDS, 1, 0, 0);
    expect(calls).toEqual(['beginPath']);
  });
});

describe('renderOperation – cells', () => {
  it('paints with source-over', () => {
    const { ctx, calls } = recordingContext();
    renderOperation(ctx, makeCells(), ORIGIN_BOUNDS, 1, 0, 0);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(calls).toContain('fill');
  });

  it('erases with destination-out', () => {
    const { ctx } = recordingContext();
    renderOperation(ctx, makeCells({ isErasing: true }), ORIGIN_BOUNDS, 1, 0, 0);
    expect(ctx.globalCompositeOperation).toBe('destination-out');
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
