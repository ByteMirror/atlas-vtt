import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import type { AlignmentPoint } from '../../pixi/GridAlignmentController';
import { isPointInQuadrant, measurementCellSize } from '../../pixi/gridAlignmentMath';
import { isHexGridType } from '../../grid/hexGeometry';
import type { MeasurementPair } from '../../pixi/gridAlignmentMath';
import {
  useCrosshairCursor,
  useArrowNudge,
  useCursorPreview,
  useAlignmentPreview,
  alignmentPointHints,
  describeGridType,
} from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUADRANT_LABELS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
const TOTAL_PAIRS = 4;
const TOTAL_STEPS = TOTAL_PAIRS * 2;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntersectionsTab({ controller, view, result, setResult, gridType }: AlignmentTabProps): React.ReactElement {
  const isHex = isHexGridType(gridType);
  const hints = alignmentPointHints(gridType);
  const [step, setStep] = useState(0);
  const [measurements, setMeasurements] = useState<MeasurementPair[]>([]);
  const [currentPointA, setCurrentPointA] = useState<AlignmentPoint | null>(null);

  // Derived state
  const isPreviewing = step >= TOTAL_STEPS;
  const quadrantIndex = Math.min(Math.floor(step / 2), 3) as 0 | 1 | 2 | 3;
  const isPlacingA = step % 2 === 0;

  // Shared hooks
  useCrosshairCursor(isPreviewing, view);
  const offsetAdjust = useArrowNudge(isPreviewing);
  useCursorPreview(isPreviewing, isPlacingA, currentPointA, controller, !isHex);
  useAlignmentPreview(measurements, offsetAdjust, isPreviewing, controller, setResult, gridType);

  // -----------------------------------------------------------------------
  // Instruction text
  // -----------------------------------------------------------------------

  function getInstructionText(): string {
    if (isPreviewing) {
      return 'Preview the grid alignment. Use arrow keys to nudge offset (Shift for sub-pixel).';
    }
    const label = QUADRANT_LABELS[quadrantIndex];
    if (isPlacingA) {
      return `Click a ${hints.first} in the ${label} area.`;
    }
    return hints.second;
  }

  // -----------------------------------------------------------------------
  // Quadrant dimming + auto-zoom
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!controller) return;

    if (isPreviewing) {
      controller.clearQuadrantDimming();
      controller.zoomToFullMap();
    } else {
      const completedPairs = Math.floor(step / 2);
      controller.showQuadrantDimming(quadrantIndex, completedPairs);
      if (isPlacingA) {
        controller.zoomToQuadrant(quadrantIndex);
      }
    }
  }, [step, isPreviewing, quadrantIndex, isPlacingA, controller]);

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

      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) return;

      const world = controller.screenToWorld(e.clientX, e.clientY);

      if (isPlacingA) {
        const mapBounds = controller.getMapBounds();
        if (mapBounds && !isPointInQuadrant(world, quadrantIndex, mapBounds)) return;

        controller.showMeasurementCrosshair(step, world);
        setCurrentPointA(world);
        setStep(s => s + 1);
      } else {
        if (currentPointA && !isHex) world.y = currentPointA.y;

        controller.showMeasurementCrosshair(step, world);

        const pairIndex = Math.floor(step / 2);
        if (currentPointA) {
          controller.showMeasurementLine(pairIndex, currentPointA, world);
          setMeasurements(prev => [...prev, { a: currentPointA, b: world }]);
        }

        setCurrentPointA(null);
        setStep(s => s + 1);
      }
    };

    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
    };
  }, [step, isPreviewing, isPlacingA, quadrantIndex, currentPointA, controller]);

  // -----------------------------------------------------------------------
  // Individual cell sizes for display
  // -----------------------------------------------------------------------

  const individualSizes = measurements.map(p => measurementCellSize(p, gridType));

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Progress indicator */}
      <div className="atlas-grid-alignment-progress">
        {Array.from({ length: TOTAL_PAIRS }, (_, i) => {
          const pairStep = i * 2;
          const isCompleted = step > pairStep + 1;
          const isActive = quadrantIndex === i && !isPreviewing;

          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className={`atlas-grid-alignment-step-connector${
                  step > pairStep ? ' atlas-grid-alignment-step-connector--completed' : ''
                }`} />
              )}
              <div className={`atlas-grid-alignment-step${
                isActive ? ' atlas-grid-alignment-step--active' : ''
              }${isCompleted ? ' atlas-grid-alignment-step--completed' : ''}`}>
                {isCompleted ? <Check size={14} /> : i + 1}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <p className="atlas-grid-alignment-hint">{getInstructionText()}</p>

      {/* Result display */}
      {result && (
        <div className="atlas-grid-alignment-result">
          <div>
            Cell size: {result.cellSize.toFixed(2)} px
            {measurements.length > 0 && ` (from ${measurements.length} measurement${measurements.length === 1 ? '' : 's'})`}
          </div>
          {measurements.length > 1 && (
            <div className="atlas-grid-alignment-measurements">
              Individual: {individualSizes.map(s => s.toFixed(1)).join(', ')} px
            </div>
          )}
          {result.gridType && result.gridType !== 'square' && (
            <div className="atlas-grid-alignment-measurements">Detected {describeGridType(result.gridType)}</div>
          )}
          {result.maxResidual !== undefined && result.maxResidual > 3 && (
            <div className="atlas-grid-alignment-measurements">
              Measurements disagree by up to {result.maxResidual.toFixed(1)} px. Re-check the clicked corners.
            </div>
          )}
        </div>
      )}
    </>
  );
}
