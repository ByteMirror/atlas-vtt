import React, { useState, useEffect } from 'react';
import type { AlignmentPoint } from '../../pixi/GridAlignmentController';
import type { MeasurementPair } from '../../pixi/gridAlignmentMath';
import {
  useCrosshairCursor,
  useArrowNudge,
  useCursorPreview,
  useAlignmentPreview,
  alignmentPointHints,
  describeGridType,
} from '../hooks/useGridAlignmentEffects';
import { isHexGridType } from '../../grid/hexGeometry';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreeSizeTab({ controller, view, result, setResult, gridType }: AlignmentTabProps): React.ReactElement {
  const isHex = isHexGridType(gridType);
  const hints = alignmentPointHints(gridType);
  const [step, setStep] = useState(0);
  const [pointA, setPointA] = useState<AlignmentPoint | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementPair | null>(null);

  const isPreviewing = step >= 2;
  const isPlacingA = step === 0;

  // Shared hooks
  useCrosshairCursor(isPreviewing, view);
  const offsetAdjust = useArrowNudge(isPreviewing);
  useCursorPreview(isPreviewing, isPlacingA, pointA, controller, !isHex);
  useAlignmentPreview(measurement ? [measurement] : [], offsetAdjust, isPreviewing, controller, setResult, gridType);

  // -----------------------------------------------------------------------
  // Instruction text
  // -----------------------------------------------------------------------

  function getInstructionText(): string {
    if (isPreviewing) {
      return 'Preview the grid. Use arrow keys to nudge offset (Shift for sub-pixel).';
    }
    if (isPlacingA) {
      return `Click any ${hints.first} on the map.`;
    }
    return hints.second;
  }

  // -----------------------------------------------------------------------
  // Viewport click handling (pointerup after short press — lets pan through)
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (isPreviewing || !controller) return;

    const DRAG_THRESHOLD = 5;
    let leftDown = false;
    let startX = 0;
    let startY = 0;

    const onDown = (e: PointerEvent): void => {
      if (e.button !== 0 || e.ctrlKey) return;
      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;
      leftDown = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onUp = (e: PointerEvent): void => {
      if (!leftDown || e.button !== 0) return;
      leftDown = false;

      if ((e.target as HTMLElement)?.tagName !== 'CANVAS') return;

      if (Math.abs(e.clientX - startX) > DRAG_THRESHOLD ||
          Math.abs(e.clientY - startY) > DRAG_THRESHOLD) return;

      const world = controller.screenToWorld(e.clientX, e.clientY);

      if (isPlacingA) {
        controller.showMeasurementCrosshair(0, world);
        setPointA(world);
        setStep(1);
      } else {
        if (pointA && !isHex) world.y = pointA.y;

        controller.showMeasurementCrosshair(1, world);

        if (pointA) {
          controller.showMeasurementLine(0, pointA, world);
          setMeasurement({ a: pointA, b: world });
        }

        setPointA(null);
        setStep(2);
      }
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, [step, isPreviewing, isPlacingA, pointA, controller]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      <p className="atlas-grid-alignment-hint">{getInstructionText()}</p>

      {result && (
        <div className="atlas-grid-alignment-result">
          <div>Cell size: {result.cellSize.toFixed(2)} px</div>
          {result.gridType && result.gridType !== 'square' && (
            <div className="atlas-grid-alignment-measurements">Detected {describeGridType(result.gridType)}</div>
          )}
        </div>
      )}
    </>
  );
}
