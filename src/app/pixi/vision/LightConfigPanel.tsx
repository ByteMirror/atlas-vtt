import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Flame, Sparkles, Lightbulb, GripHorizontal } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import { beginHistoryTransaction, endHistoryTransaction } from '../../stores/history';
import type { LightSource, LightStyle } from '../../types/wallTypes';

import './light-config-panel.scss';
import { CloseButton } from '../../packages/components/primitives/CloseButton';

const LIGHT_STYLE_OPTIONS: Array<{ value: LightStyle; label: string; icon: React.ComponentType<any> }> = [
  { value: 'torch', label: 'Torch', icon: Flame },
  { value: 'magic', label: 'Magic', icon: Sparkles },
  { value: 'steady', label: 'Steady', icon: Lightbulb },
];

const COLOR_PRESETS = [
  { value: '#ff9933', label: 'Warm Orange' },
  { value: '#ffcc44', label: 'Golden Yellow' },
  { value: '#ccddff', label: 'Cool White' },
  { value: '#4488ff', label: 'Blue' },
  { value: '#aa44ff', label: 'Purple' },
  { value: '#44ff88', label: 'Green' },
  { value: '#ff4433', label: 'Red' },
  { value: '#ffffff', label: 'White' },
];

interface LightConfigPanelProps {
  light: LightSource;
  store: StoreApi<ViewAtlasState>;
  screenX: number;
  screenY: number;
  onClose: () => void;
}

/** Convert game units (feet/meters) to world pixels. */
function unitsToPixels(units: number, gridSize: number, unitDistance: number): number {
  if (unitDistance <= 0) return units;
  return (units / unitDistance) * gridSize;
}

/** Convert world pixels to game units (feet/meters). */
function pixelsToUnits(pixels: number, gridSize: number, unitDistance: number): number {
  if (gridSize <= 0) return pixels;
  return (pixels / gridSize) * unitDistance;
}

function LightConfigPanelInner({ light, store, screenX, screenY, onClose }: LightConfigPanelProps): React.ReactElement {
  // Read grid settings for unit conversion
  const grid = store.getState().grid;
  const gridSize = grid?.size ?? 70;
  const unitDistance = grid?.unitDistance ?? 5;
  const unitLabel = grid?.unitType === 'meters' ? 'm' : grid?.unitType === 'units' ? '' : 'ft';

  // Store values in game units for the UI
  const [innerUnits, setInnerUnits] = useState(
    Math.round(pixelsToUnits(light.innerRadius, gridSize, unitDistance))
  );
  const [outerUnits, setOuterUnits] = useState(
    Math.round(pixelsToUnits(light.outerRadius ?? light.innerRadius, gridSize, unitDistance))
  );
  const [lightStyle, setLightStyle] = useState<LightStyle>(light.lightStyle ?? 'torch');
  const [color, setColor] = useState(light.color ?? '#ff9933');

  // Dragging state
  const [pos, setPos] = useState({ x: screenX + 20, y: screenY - 40 });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; panelX: number; panelY: number } | null>(null);

  // The whole editing session is one undo step, even though changes apply live
  useEffect(() => {
    beginHistoryTransaction(store);
    return () => endHistoryTransaction(store);
  }, [store]);

  // Apply changes live — convert game units back to world pixels for storage
  useEffect(() => {
    store.getState().updateLight(light.id, {
      innerRadius: unitsToPixels(innerUnits, gridSize, unitDistance),
      outerRadius: unitsToPixels(outerUnits, gridSize, unitDistance),
      lightStyle,
      color,
    });
  }, [innerUnits, outerUnits, lightStyle, color, light.id, store, gridSize, unitDistance]);

  // Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clamp panel to viewport on mount
  useEffect(() => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    setPos(prev => ({
      x: Math.max(8, Math.min(prev.x, maxX)),
      y: Math.max(8, Math.min(prev.y, maxY)),
    }));
  }, []);

  // Drag handlers
  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, panelX: pos.x, panelY: pos.y };
    const onMove = (ev: PointerEvent): void => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.panelX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.panelY + (ev.clientY - dragRef.current.startY),
      });
    };
    const onUp = (): void => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [pos]);

  return (
    <div
      ref={panelRef}
      className="atlas-light-config"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Drag handle + header */}
      <div className="atlas-light-config__header" onPointerDown={onDragStart}>
        <GripHorizontal size={14} className="atlas-light-config__grip" />
        <span className="atlas-light-config__title">Light Configuration</span>
        <CloseButton onClick={onClose} />
      </div>

      <div className="atlas-light-config__body">
        {/* Light Style selector */}
        <div className="atlas-light-config__section-label">Style</div>
        <div className="atlas-light-config__style-row">
          {LIGHT_STYLE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = lightStyle === opt.value;
            return (
              <button
                key={opt.value}
                className={`atlas-light-config__style-btn ${isActive ? 'atlas-light-config__style-btn--active' : ''}`}
                onClick={() => setLightStyle(opt.value)}
                title={opt.label}
              >
                <Icon size={16} />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Color picker */}
        <div className="atlas-light-config__section-label">Color</div>
        <div className="atlas-light-config__color-row">
          {COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              className={`atlas-light-config__color-swatch ${color === preset.value ? 'atlas-light-config__color-swatch--active' : ''}`}
              style={{ backgroundColor: preset.value }}
              onClick={() => setColor(preset.value)}
              title={preset.label}
            />
          ))}
        </div>

        {/* Radii */}
        <div className="atlas-light-config__section-label">Range</div>

        <div className="atlas-light-config__field">
          <label className="atlas-light-config__label">Bright Radius{unitLabel ? ` (${unitLabel})` : ''}</label>
          <div className="atlas-light-config__slider-row">
            <input
              type="range"
              min={0}
              max={120}
              step={5}
              value={innerUnits}
              onChange={(e) => setInnerUnits(Number(e.target.value))}
              className="atlas-light-config__slider"
            />
            <input
              type="number"
              className="atlas-input atlas-light-config__number"
              value={innerUnits}
              onChange={(e) => setInnerUnits(Math.max(0, Number(e.target.value)))}
              min={0}
            />
          </div>
        </div>

        <div className="atlas-light-config__field">
          <label className="atlas-light-config__label">Dim Radius{unitLabel ? ` (${unitLabel})` : ''}</label>
          <div className="atlas-light-config__slider-row">
            <input
              type="range"
              min={0}
              max={240}
              step={5}
              value={outerUnits}
              onChange={(e) => setOuterUnits(Number(e.target.value))}
              className="atlas-light-config__slider"
            />
            <input
              type="number"
              className="atlas-input atlas-light-config__number"
              value={outerUnits}
              onChange={(e) => setOuterUnits(Math.max(0, Number(e.target.value)))}
              min={0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Imperatively opens a Light Configuration panel near the light source.
 */
export function openLightConfigPanel(
  lightId: string,
  store: StoreApi<ViewAtlasState>,
  screenX?: number,
  screenY?: number,
): void {
  const light = store.getState().objects.lights[lightId];
  if (!light) return;

  const container = document.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });

  const root = createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    container.remove();
  };

  root.render(
    <LightConfigPanelInner
      light={light}
      store={store}
      screenX={screenX ?? window.innerWidth / 2}
      screenY={screenY ?? window.innerHeight / 2}
      onClose={cleanup}
    />
  );
}
