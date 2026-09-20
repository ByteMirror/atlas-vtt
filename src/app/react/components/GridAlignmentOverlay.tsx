import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Crosshair, RotateCcw, Wand2 } from 'lucide-react';
import { useAtlasUI } from '../root/AtlasUIContext';
import { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentResult } from '../../pixi/GridAlignmentController';
import type { GridType } from '../../grid/GridSystem';
import { detectGridFromSprite } from '../../pixi/gridDetection/detectGrid';
import { describeGridType } from '../hooks/useGridAlignmentEffects';
import { IntersectionsTab } from './IntersectionsTab';
import { FreeSizeTab } from './FreeSizeTab';
import { CloseButton } from '../../packages/components/primitives/CloseButton';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridAlignmentOverlayProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridAlignmentOverlay({ onClose }: GridAlignmentOverlayProps): React.ReactElement {
  const { view } = useAtlasUI();
  const store = view?.atlasStore;
  const gridType: GridType = store?.getState().grid?.type ?? 'square';

  const [activeTab, setActiveTab] = useState<'intersections' | 'quick'>('intersections');
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [, setControllerVersion] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<string | null>(null);

  const controllerRef = useRef<GridAlignmentController | null>(null);

  // -----------------------------------------------------------------------
  // Controller lifecycle
  // -----------------------------------------------------------------------

  const initController = useCallback((): void => {
    const viewport = view?.renderer?.getViewportInstance();
    const gridSystem = view?.renderer?.getGridSystem();
    const canvasEl = view?.renderer?.getCanvasElement();
    const bgSprite = view?.renderer?.getBackgroundSprite?.() ?? null;
    if (!viewport || !gridSystem || !canvasEl) return;

    controllerRef.current = new GridAlignmentController(viewport, gridSystem, canvasEl, bgSprite);
    setControllerVersion(v => v + 1);
  }, [view]);

  // -----------------------------------------------------------------------
  // Ensure viewport panning/zooming works during alignment
  // -----------------------------------------------------------------------

  useEffect(() => {
    const viewport = view?.renderer?.getViewportInstance();
    if (!viewport) return;

    // Dismiss any blocking overlays left over from how the user got here
    // (e.g. the command palette backdrop that sits full-screen above the canvas).
    const backdrop = document.querySelector<HTMLElement>('.atlas-command-palette-backdrop');
    if (backdrop) backdrop.click();

    // The drag plugin is paused for most tools (select, fog, draw…).
    // We need right-click drag (panning) while placing alignment points.
    const wasDragPaused = viewport.plugins.get('drag')?.paused ?? false;
    viewport.plugins.resume('drag');

    return () => {
      if (wasDragPaused) viewport.plugins.pause('drag');
    };
  }, [view]);

  useEffect(() => {
    initController();

    return () => {
      if (controllerRef.current) {
        view?.renderer?.cancelGridAlignment?.();
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
    };
  }, [initController, view]);

  // -----------------------------------------------------------------------
  // Callbacks
  // -----------------------------------------------------------------------

  const handleCancel = useCallback((): void => {
    view?.renderer?.cancelGridAlignment?.();
    controllerRef.current?.destroy();
    controllerRef.current = null;
    onClose();
  }, [onClose, view]);

  const handleReset = useCallback((): void => {
    view?.renderer?.cancelGridAlignment?.();
    controllerRef.current?.destroy();
    controllerRef.current = null;

    setResult(null);
    setDetectionStatus(null);
    initController();
    setResetKey(k => k + 1);
  }, [initController, view]);

  const handleAutoDetect = useCallback((): void => {
    const sprite = view?.renderer?.getBackgroundSprite?.();
    if (!sprite || detecting) return;

    controllerRef.current?.cleanupVisuals();
    setResult(null);
    setResetKey(k => k + 1);
    setDetecting(true);
    setDetectionStatus('Analysing map image…');

    // Let the status paint before the CPU-bound detection runs.
    window.setTimeout(() => {
      let detected: AlignmentResult | null = null;
      try {
        detected = detectGridFromSprite(sprite);
      } catch (error) {
        console.error('[GridAlignment] Auto-detect failed', error);
      }
      setDetecting(false);
      if (!detected || !detected.gridType) {
        setDetectionStatus('No grid found in the map image. Align manually instead.');
        return;
      }
      setResult(detected);
      controllerRef.current?.showPreview(detected.cellSize, detected.offsetX, detected.offsetY, detected.gridType);
      setDetectionStatus(
        `Detected ${describeGridType(detected.gridType)}, ${detected.cellSize.toFixed(2)} px (confidence ${detected.confidence?.toFixed(1)}×). Check the preview, then Apply.`,
      );
    }, 30);
  }, [view, detecting]);

  const handleApply = useCallback((): void => {
    if (!store || !result) return;

    const { cellSize, offsetX, offsetY, gridType: resultType } = result;

    const renderer = view?.renderer;
    if (renderer?.applyGridAlignment) {
      renderer.applyGridAlignment(cellSize, offsetX, offsetY, resultType);
    }

    const currentGrid = store.getState().grid;
    if (!currentGrid) return;
    store.getState().setGrid({
      ...currentGrid,
      ...(resultType ? { type: resultType } : {}),
      size: cellSize,
      offsetX,
      offsetY,
      enabled: true,
      visible: true,
    });

    controllerRef.current?.destroy();
    controllerRef.current = null;
    onClose();
  }, [store, result, onClose, view]);

  // -----------------------------------------------------------------------
  // Tab switching — clean up visuals from previous tab
  // -----------------------------------------------------------------------

  const handleTabChange = useCallback((tab: 'intersections' | 'quick'): void => {
    if (tab === activeTab) return;
    controllerRef.current?.cleanupVisuals();
    setResult(null);
    setDetectionStatus(null);
    setResetKey(k => k + 1);
    setActiveTab(tab);
  }, [activeTab]);

  // -----------------------------------------------------------------------
  // Escape key
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCancel]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="atlas-vtt-plugin atlas-vtt-root" style={{ pointerEvents: 'none' }}>
      <div className="atlas-grid-alignment-panel">
        <div className="atlas-grid-alignment-header">
          <div className="atlas-grid-alignment-title">
            <Crosshair size={16} />
            <span>Grid Alignment</span>
          </div>
          <CloseButton onClick={handleCancel} />
        </div>

        {/* Tab switcher */}
        <div className="atlas-grid-alignment-tabs">
          <button
            className={`atlas-grid-alignment-tab${activeTab === 'intersections' ? ' is-active' : ''}`}
            onClick={() => handleTabChange('intersections')}
          >
            Intersections
          </button>
          <button
            className={`atlas-grid-alignment-tab${activeTab === 'quick' ? ' is-active' : ''}`}
            onClick={() => handleTabChange('quick')}
          >
            Quick
          </button>
        </div>

        {/* Automatic detection from the map image; the tabs below stay available as the manual path */}
        <button
          className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary atlas-grid-alignment-btn--wide"
          disabled={detecting}
          onClick={handleAutoDetect}
          title="Detect grid type, size and offset from the map image"
        >
          <Wand2 size={14} />
          {detecting ? 'Detecting…' : 'Auto-detect from map image'}
        </button>
        {detectionStatus && <p className="atlas-grid-alignment-hint">{detectionStatus}</p>}

        {/* Active tab content */}
        {activeTab === 'intersections'
          ? <IntersectionsTab
              key={resetKey}
              controller={controllerRef.current}
              view={view}
              result={result}
              setResult={setResult}
              gridType={gridType}
            />
          : <FreeSizeTab
              key={resetKey}
              controller={controllerRef.current}
              view={view}
              result={result}
              setResult={setResult}
              gridType={gridType}
            />
        }

        {/* Action buttons */}
        <div className="atlas-grid-alignment-actions">
          <button className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary" onClick={handleReset}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button
            className="atlas-grid-alignment-btn atlas-grid-alignment-btn--primary"
            disabled={!result}
            onClick={handleApply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
