import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { SettingRow, SettingSliderRow, SettingToggleRow } from './SettingRows';
import type { AtlasView } from '../../../atlas-view';
import type { GridType } from '../../../grid/GridSystem';

const GRID_COLORS = [
  { value: '#00FFFF', label: 'Cyan' },
  { value: '#FFFFFF', label: 'White' },
  { value: '#000000', label: 'Black' },
  { value: '#FF0000', label: 'Red' },
  { value: '#00FF00', label: 'Green' },
  { value: '#0000FF', label: 'Blue' },
  { value: '#FFFF00', label: 'Yellow' },
  { value: '#FF00FF', label: 'Magenta' },
  { value: '#808080', label: 'Gray' },
  { value: '#FFA500', label: 'Orange' },
  { value: '#800080', label: 'Purple' },
  { value: '#FFC0CB', label: 'Pink' },
] as const;

const GRID_TYPE_OPTIONS = {
  square: 'Square',
  'hex-horizontal': 'Hex (Flat)',
  'hex-vertical': 'Hex (Pointy)',
};

function isGridType(value: string): value is GridType {
  return value in GRID_TYPE_OPTIONS;
}

const LINE_STYLE_OPTIONS = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
};

interface GridSettingsPanelProps {
  view: AtlasView | null;
  localOpacity: number;
  setLocalOpacity: (opacity: number) => void;
  localLineWidth: number;
  setLocalLineWidth: (lineWidth: number) => void;
  localGridVisible: boolean;
  setLocalGridVisible: (visible: boolean) => void;
  localSnapToGrid: boolean;
  setLocalSnapToGrid: (snap: boolean) => void;
  debouncedOpacityUpdate: (opacity: number) => void;
  debouncedLineWidthUpdate: (lineWidth: number) => void;
}

export function GridSettingsPanel({
  view,
  localOpacity,
  setLocalOpacity,
  localLineWidth,
  setLocalLineWidth,
  localGridVisible,
  setLocalGridVisible,
  localSnapToGrid,
  setLocalSnapToGrid,
  debouncedOpacityUpdate,
  debouncedLineWidthUpdate,
}: GridSettingsPanelProps): React.ReactElement {
  const currentGrid = view?.atlasStore?.getState()?.grid;
  const currentType: string = currentGrid?.type ?? 'square';
  const currentColor: string = currentGrid?.color ?? '#00FFFF';
  const currentLineType: string = currentGrid?.lineType ?? 'solid';

  const patchGrid = (patch: Record<string, unknown>): void => {
    if (!view?.atlasStore) return;
    const grid = view.atlasStore.getState().grid;
    if (!grid) return;
    view.atlasStore.getState().setGrid({ ...grid, ...patch });
  };

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
      <SettingToggleRow
        label="Show grid"
        value={localGridVisible}
        onToggle={() => {
          const next = !localGridVisible;
          setLocalGridVisible(next);
          view?.atlasStore?.getState().setGridVisible(next);
        }}
      />

      <SettingToggleRow
        label="Snap to grid"
        hint="Tokens, pins and measurements settle on cell centres"
        value={localSnapToGrid}
        onToggle={() => {
          const next = !localSnapToGrid;
          setLocalSnapToGrid(next);
          view?.atlasStore?.getState().setSnapToGrid(next);
        }}
      />

      <SettingRow label="Grid type">
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown"
          value={currentType}
          options={GRID_TYPE_OPTIONS}
          onChange={(newType) => {
            if (!isGridType(newType)) return;
            view?.renderer?.getGridSystem()?.setGridType(newType);
            patchGrid({ type: newType });
          }}
        />
      </SettingRow>

      <SettingRow label="Line style">
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown"
          value={currentLineType}
          options={LINE_STYLE_OPTIONS}
          onChange={(newLineType) => patchGrid({ lineType: newLineType })}
        />
      </SettingRow>

      <SettingSliderRow
        label="Opacity"
        value={localOpacity * 100}
        min={0}
        max={100}
        step={5}
        displayValue={`${Math.round(localOpacity * 100)}%`}
        onChange={(percent) => {
          const opacity = percent / 100;
          setLocalOpacity(opacity);
          debouncedOpacityUpdate(opacity);
        }}
      />

      <SettingSliderRow
        label="Line width"
        value={localLineWidth}
        min={0.5}
        max={5}
        step={0.5}
        displayValue={`${localLineWidth}px`}
        onChange={(lineWidth) => {
          setLocalLineWidth(lineWidth);
          debouncedLineWidthUpdate(lineWidth);
        }}
      />
      </div>

      <div className="atlas-command-palette-panel-column">
      <div className="atlas-setting-group">
        <span className="atlas-setting-label">Colour</span>
        <div className="atlas-command-palette-swatches" role="radiogroup" aria-label="Grid colour">
          {GRID_COLORS.map((color) => {
            const isActive = currentColor === color.value;
            return (
              <button
                key={color.value}
                type="button"
                className={cn('atlas-command-palette-swatch', isActive && 'atlas-active')}
                onClick={() => patchGrid({ color: color.value })}
                title={color.label}
                aria-label={color.label}
                role="radio"
                aria-checked={isActive}
                style={{ backgroundColor: color.value }}
              >
                {isActive && <Check className="atlas-command-palette-swatch-check" />}
              </button>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
