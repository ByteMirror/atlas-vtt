import React, { useState, useEffect } from 'react';
import { Grid, Hexagon } from 'lucide-react';
import { CloseButton } from '../../packages/components/primitives/CloseButton';

interface GridSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  view: any;
}

type GridType = 'square' | 'hex-horizontal' | 'hex-vertical';
type UnitType = 'feet' | 'meters' | 'units';

interface GridSettings {
  type: GridType;
  size: number;
  unitType: UnitType;
  unitDistance: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  opacity: number;
}

export function GridSettingsModal({ isOpen, onClose, view }: GridSettingsModalProps) {
  // Grid settings state - initialize from store when modal opens
  const [settings, setSettings] = useState<GridSettings>(() => {
    const currentGrid = view?.store?.getState()?.grid;
    return {
      type: currentGrid?.type || 'square',
      size: currentGrid?.size || 50,
      unitType: currentGrid?.unitType || 'feet',
      unitDistance: currentGrid?.unitDistance || 5,
      offsetX: currentGrid?.offsetX || 0,
      offsetY: currentGrid?.offsetY || 0,
      scale: currentGrid?.scale || 1,
      opacity: currentGrid?.opacity || 0.3
    };
  });
  
  const [gridVisible, setLocalGridVisible] = useState(() => {
    return view?.store?.getState()?.grid?.visible ?? true;
  });
  
  // Update settings when modal opens to reflect current store state
  useEffect(() => {
    if (isOpen && view?.store) {
      const currentGrid = view.store.getState().grid;
      if (currentGrid) {
        setSettings({
          type: currentGrid.type || 'square',
          size: currentGrid.size || 50,
          unitType: currentGrid.unitType || 'feet',
          unitDistance: currentGrid.unitDistance || 5,
          offsetX: currentGrid.offsetX || 0,
          offsetY: currentGrid.offsetY || 0,
          scale: currentGrid.scale || 1,
          opacity: currentGrid.opacity || 0.3
        });
        setLocalGridVisible(currentGrid.visible ?? true);
      }
    }
  }, [isOpen, view]);

  const updateSetting = <K extends keyof GridSettings>(key: K, value: GridSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const applySettings = () => {
    if (view?.renderer?.gridSystem) {
      const gridSystem = view.renderer.gridSystem;
      
      // Update grid settings
      gridSystem.setGridType(settings.type);
      gridSystem.setGridSize(settings.size);
      gridSystem.setGridOffset(settings.offsetX, settings.offsetY);
      gridSystem.setGridOpacity(settings.opacity);
      
      // Update grid visibility and settings via store
      if (view?.store) {
        view.store.getState().setGridVisible(gridVisible);
        view.store.getState().setGridUnits({
          unitType: settings.unitType,
          unitDistance: settings.unitDistance
        });
        
        // Update grid settings in store for persistence
        const currentGrid = view.store.getState().grid;
        const newGridState = {
          ...currentGrid,
          type: settings.type,
          size: settings.size,
          offsetX: settings.offsetX,
          offsetY: settings.offsetY,
          opacity: settings.opacity,
          unitType: settings.unitType,
          unitDistance: settings.unitDistance,
          visible: gridVisible,
          enabled: currentGrid?.enabled ?? true
        };
        
        view.store.getState().setGrid(newGridState);
        
        // Verify it was set
      }
    }
    
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="atlas-vtt-plugin atlas-vtt-root atlas-grid-settings-overlay">
      <div className="atlas-grid-settings-backdrop" onClick={onClose} />
      
      <div className="atlas-vtt-plugin atlas-grid-settings-modal">
        <div className="atlas-grid-settings-header">
          <h2>Grid Settings</h2>
          <CloseButton onClick={onClose} />
        </div>
        
        <div className="atlas-grid-settings-content">
          {/* Grid Type Selection */}
          <div className="atlas-grid-settings-section">
            <h3>Grid Type</h3>
            <div className="atlas-grid-type-options">
              <button
                className={`atlas-grid-type-option ${settings.type === 'square' ? 'atlas-active' : ''}`}
                onClick={() => updateSetting('type', 'square')}
              >
                <Grid size={24} />
                <span>Square</span>
              </button>
              <button
                className={`atlas-grid-type-option ${settings.type === 'hex-horizontal' ? 'atlas-active' : ''}`}
                onClick={() => updateSetting('type', 'hex-horizontal')}
              >
                <Hexagon size={24} />
                <span>Hex (Flat)</span>
              </button>
              <button
                className={`atlas-grid-type-option ${settings.type === 'hex-vertical' ? 'atlas-active' : ''}`}
                onClick={() => updateSetting('type', 'hex-vertical')}
              >
                <Hexagon size={24} className="atlas-rotate-30" />
                <span>Hex (Pointy)</span>
              </button>
            </div>
          </div>
          
          {/* Grid Size */}
          <div className="atlas-grid-settings-section">
            <h3>Grid Size</h3>
            <div className="atlas-grid-size-control">
              <input
                type="range"
                min="20"
                max="200"
                value={settings.size}
                onChange={(e) => updateSetting('size', Number(e.target.value))}
                className="atlas-grid-slider"
              />
              <span className="atlas-grid-size-value">{settings.size}px</span>
            </div>
          </div>
          
          {/* Grid Units */}
          <div className="atlas-grid-settings-section">
            <h3>Grid Units</h3>
            <div className="atlas-grid-units-control">
              <input
                type="number"
                min="1"
                max="100"
                value={settings.unitDistance}
                onChange={(e) => updateSetting('unitDistance', Number(e.target.value))}
                className="atlas-grid-units-input"
              />
              <select
                value={settings.unitType}
                onChange={(e) => updateSetting('unitType', e.target.value as UnitType)}
                className="atlas-grid-units-select"
              >
                <option value="feet">feet</option>
                <option value="meters">meters</option>
                <option value="units">units</option>
              </select>
              <span className="atlas-grid-units-label">per {settings.type === 'square' ? 'square' : 'hex'}</span>
            </div>
          </div>
          
          {/* Grid Opacity */}
          <div className="atlas-grid-settings-section">
            <h3>Grid Opacity</h3>
            <div className="atlas-grid-opacity-control">
              <input
                type="range"
                min="0"
                max="100"
                value={settings.opacity * 100}
                onChange={(e) => updateSetting('opacity', Number(e.target.value) / 100)}
                className="atlas-grid-slider"
              />
              <span className="atlas-grid-opacity-value">{Math.round(settings.opacity * 100)}%</span>
            </div>
          </div>
          
          {/* Grid Visibility Toggle */}
          <div className="atlas-grid-settings-section">
            <label className="atlas-grid-visibility-toggle">
              <input
                type="checkbox"
                checked={gridVisible}
                onChange={(e) => setLocalGridVisible(e.target.checked)}
              />
              <span>Show Grid</span>
            </label>
          </div>
        </div>
        
        <div className="atlas-grid-settings-footer">
          <button className="atlas-grid-settings-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="atlas-grid-settings-apply" onClick={applySettings}>
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
}