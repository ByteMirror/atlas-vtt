/**
 * Shared hooks for grid alignment tab components.
 *
 * Extracts the duplicated useEffect logic from IntersectionsTab and FreeSizeTab
 * into reusable hooks: cursor style, arrow-key nudging, cursor preview, and
 * alignment preview calculation.
 */

import { useState, useEffect } from 'react';
import type { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentPoint, AlignmentResult } from '../../pixi/GridAlignmentController';
import { calculateAlignment } from '../../pixi/gridAlignmentMath';
import type { MeasurementPair } from '../../pixi/gridAlignmentMath';
import type { GridType } from '../../grid/GridSystem';
import { isHexGridType } from '../../grid/hexGeometry';
import { setCanvasCursor } from '../../pixi/utils/canvasCursor';

// ---------------------------------------------------------------------------
// Shared prop type for both alignment tabs
// ---------------------------------------------------------------------------

export interface AlignmentTabProps {
  controller: GridAlignmentController | null;
  view: { renderer?: { pixiAppManager?: { getCanvasElement(): HTMLCanvasElement | null } } } | null;
  result: AlignmentResult | null;
  setResult: (r: AlignmentResult | null) => void;
  gridType: GridType;
}

/** Instruction fragments for the two clicks of a measurement, per grid type. */
export function alignmentPointHints(gridType: GridType): { first: string; second: string } {
  if (isHexGridType(gridType)) {
    return { first: 'hex corner', second: 'Click the neighbouring corner along the same hex edge.' };
  }
  return { first: 'grid intersection', second: 'Click the adjacent intersection to the right.' };
}

export function describeGridType(gridType: GridType): string {
  if (gridType === 'hex-vertical') return 'pointy-top hexes';
  if (gridType === 'hex-horizontal') return 'flat-top hexes';
  return 'squares';
}

// ---------------------------------------------------------------------------
// useCrosshairCursor — sets crosshair cursor on canvas during placement
// ---------------------------------------------------------------------------

export function useCrosshairCursor(isPreviewing: boolean, view: AlignmentTabProps['view']): void {
  useEffect(() => {
    const canvasEl = view?.renderer?.pixiAppManager?.getCanvasElement();
    if (!canvasEl) return;

    if (!isPreviewing) {
      const prev = canvasEl.style.cursor;
      setCanvasCursor(canvasEl, 'crosshair');
      return () => { setCanvasCursor(canvasEl, prev); };
    }
    return undefined;
  }, [isPreviewing, view]);
}

// ---------------------------------------------------------------------------
// useArrowNudge — arrow key offset nudging during preview
// ---------------------------------------------------------------------------

export function useArrowNudge(isPreviewing: boolean): { dx: number; dy: number } {
  const [offsetAdjust, setOffsetAdjust] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  useEffect(() => {
    if (!isPreviewing) return;

    const handler = (e: KeyboardEvent): void => {
      const nudge = e.shiftKey ? 0.1 : 1;
      let dx = 0;
      let dy = 0;

      switch (e.key) {
        case 'ArrowLeft':  dx = -nudge; break;
        case 'ArrowRight': dx = nudge;  break;
        case 'ArrowUp':    dy = -nudge; break;
        case 'ArrowDown':  dy = nudge;  break;
        default: return;
      }

      e.preventDefault();
      e.stopPropagation();
      setOffsetAdjust(prev => ({ dx: prev.dx + dx, dy: prev.dy + dy }));
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPreviewing]);

  return offsetAdjust;
}

// ---------------------------------------------------------------------------
// useCursorPreview — ghost crosshair that follows the pointer during placement
// ---------------------------------------------------------------------------

export function useCursorPreview(
  isPreviewing: boolean,
  isPlacingA: boolean,
  pointA: AlignmentPoint | null,
  controller: GridAlignmentController | null,
  lockToRow: boolean,
): void {
  useEffect(() => {
    if (isPreviewing) {
      controller?.hideCursorPreview();
      return;
    }
    if (!controller) return;

    const handler = (e: PointerEvent): void => {
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;

      const lockY = lockToRow && !isPlacingA && pointA ? pointA.y : undefined;
      controller.updateCursorPreview(e.clientX, e.clientY, lockY);
    };

    window.addEventListener('pointermove', handler, true);
    return () => {
      window.removeEventListener('pointermove', handler, true);
      controller?.hideCursorPreview();
    };
  }, [isPreviewing, isPlacingA, pointA, controller, lockToRow]);
}

// ---------------------------------------------------------------------------
// useAlignmentPreview — recalculates grid preview when measurements change
// ---------------------------------------------------------------------------

export function useAlignmentPreview(
  measurements: MeasurementPair[],
  offsetAdjust: { dx: number; dy: number },
  isPreviewing: boolean,
  controller: GridAlignmentController | null,
  setResult: (r: AlignmentResult | null) => void,
  gridType: GridType,
): void {
  useEffect(() => {
    if (!controller || !isPreviewing || measurements.length === 0) return;

    const calc = calculateAlignment(measurements, gridType);
    if (calc) {
      const adjustedResult: AlignmentResult = {
        ...calc,
        offsetX: calc.offsetX + offsetAdjust.dx,
        offsetY: calc.offsetY + offsetAdjust.dy,
      };
      setResult(adjustedResult);
      controller.showPreview(adjustedResult.cellSize, adjustedResult.offsetX, adjustedResult.offsetY, adjustedResult.gridType);
    } else {
      setResult(null);
    }
  }, [measurements, offsetAdjust, isPreviewing, controller, setResult, gridType]);
}
