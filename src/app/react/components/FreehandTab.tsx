import React, { useEffect, useState } from 'react';
import { Hexagon, Square } from 'lucide-react';
import type { GridType } from '../../grid/GridSystem';
import { gridOffsetCenteredAt, normaliseGridOffset } from '../../grid/gridPlacement';
import { isHexGridType } from '../../grid/hexGeometry';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { useArrowNudge, useCrosshairCursor } from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';
import { useFreehandGridPlacement } from '../hooks/useFreehandGridPlacement';
import type { FreehandPlacement } from '../hooks/useFreehandGridPlacement';
import { t } from '../../i18n';

const GRID_TYPE_CHOICES: ReadonlyArray<{ type: GridType; label: string; tooltip: string; icon: React.ReactElement }> = [
  { type: 'square', label: t('align.square'), tooltip: t('align.squareTip'), icon: <Square /> },
  { type: 'hex-vertical', label: t('align.pointy'), tooltip: t('align.pointyTip'), icon: <Hexagon /> },
  { type: 'hex-horizontal', label: t('align.flat'), tooltip: t('align.flatTip'), icon: <Hexagon className="atlas-grid-alignment-icon--flat" /> },
];

/**
 * Places a grid by eye on maps without one: a token in a small patch of grid
 * follows the pointer at a fixed size on screen, the map's zoom sets the cell
 * size, and a click puts the grid there.
 */
export function FreehandTab({ controller, view, result, setResult, gridType: sceneGridType }: AlignmentTabProps): React.ReactElement {
  const [gridType, setGridType] = useState<GridType>(sceneGridType);
  const [placement, setPlacement] = useState<FreehandPlacement | null>(null);
  const isPlaced = placement !== null;

  useCrosshairCursor(isPlaced, view);
  const offsetAdjust = useArrowNudge(isPlaced);
  const liveCellSize = useFreehandGridPlacement(view, gridType, !isPlaced, setPlacement);

  // The scene's current grid would only distract while the new one is placed; leaving the tab restores it.
  useEffect(() => {
    if (!controller) return;
    if (!placement) {
      controller.hidePreview();
      setResult(null);
      return;
    }
    const { cellSize, point } = placement;
    const centred = gridOffsetCenteredAt(gridType, cellSize, point);
    const { offsetX, offsetY } = normaliseGridOffset(gridType, cellSize, centred.offsetX + offsetAdjust.dx, centred.offsetY + offsetAdjust.dy);
    setResult({ cellSize, offsetX, offsetY, gridType });
    controller.showPreview(cellSize, offsetX, offsetY, gridType);
  }, [controller, placement, gridType, offsetAdjust, setResult]);

  useEffect(() => () => view?.renderer?.cancelGridAlignment(), [view]);

  const hint = isPlaced
    ? t('align.placed')
    : t(isHexGridType(gridType) ? 'align.zoomHex' : 'align.zoomSquare');
  const cellSize = result?.cellSize ?? liveCellSize;

  return (
    <>
      <div className="atlas-grid-alignment-tabs" role="radiogroup" aria-label={t('align.gridType')}>
        {GRID_TYPE_CHOICES.map(choice => (
          <LabelTooltip key={choice.type} label={choice.tooltip} describe>
            <button
              role="radio"
              aria-checked={gridType === choice.type}
              className={`atlas-grid-alignment-tab${gridType === choice.type ? ' is-active' : ''}`}
              onClick={() => setGridType(choice.type)}
            >
              {choice.icon}
              {choice.label}
            </button>
          </LabelTooltip>
        ))}
      </div>

      <p className="atlas-grid-alignment-hint">{hint}</p>

      {cellSize !== null && (
        <div className="atlas-grid-alignment-result">
          <div>Cell size: {cellSize.toFixed(2)} px</div>
        </div>
      )}

      {isPlaced && (
        <button
          className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary atlas-grid-alignment-btn--wide"
          onClick={() => setPlacement(null)}
        >
          {t('align.placeAgain')}
        </button>
      )}
    </>
  );
}
