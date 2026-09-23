/**
 * CollectionSettingsModal
 *
 * Vertical-tabbed modal for configuring per-collection settings:
 *   Game System | Grid & Measurement | Default Widgets | Conditions
 *
 * Opens after collection creation and via a gear button in the sidebar.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Grid3X3, LayoutGrid, ShieldAlert, Eye } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { useAtlasUI } from '../root/AtlasUIContext';
import { AssetService } from '../../services/AssetService';
import type {
  CollectionSettings,
  CollectionGridDefaults,
  ConditionDefinition,
  VisionSettings,
} from '../../types/collectionSettingsTypes';

import { GridMeasurementTab } from './collection-settings/GridMeasurementTab';
import { DefaultWidgetsTab } from './collection-settings/DefaultWidgetsTab';
import { ConditionsTab } from './collection-settings/ConditionsTab';
import { VisionTab } from './collection-settings/VisionTab';
import { WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';

import { CloseButton } from '../../packages/components/primitives/CloseButton';

// ── Types ──────────────────────────────────────────────────────────────────

interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
}

type TabId = 'grid' | 'widgets' | 'conditions' | 'vision';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'grid', label: 'Grid & Measure', icon: <Grid3X3 size={16} /> },
  { id: 'widgets', label: 'Default Widgets', icon: <LayoutGrid size={16} /> },
  { id: 'conditions', label: 'Conditions', icon: <ShieldAlert size={16} /> },
  ...(WALLS_AND_LIGHTING_ENABLED ? [{ id: 'vision' as const, label: 'Vision', icon: <Eye size={16} /> }] : []),
];

const DEFAULT_GRID: CollectionGridDefaults = {
  unitType: 'feet',
  unitDistance: 5,
  measurementMode: 'metric',
  abstractRangeBands: [],
};

// ── Component ──────────────────────────────────────────────────────────────

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collectionId,
}: CollectionSettingsModalProps): React.ReactElement | null {
  const { app } = useAtlasUI();
  const assetService = app ? AssetService.getInstance(app) : null;

  const [activeTab, setActiveTab] = useState<TabId>('grid');
  const [collectionName, setCollectionName] = useState('');
  const [releaseLine, setReleaseLine] = useState('');

  // Local draft of settings — only persisted on Save
  const [gridDefaults, setGridDefaults] = useState<CollectionGridDefaults>(DEFAULT_GRID);
  const [defaultWidgets, setDefaultWidgets] = useState<Record<string, boolean>>({});
  const [conditions, setConditions] = useState<ConditionDefinition[]>([]);
  const [vision, setVision] = useState<VisionSettings | undefined>(undefined);

  // Load existing settings on open
  useEffect(() => {
    if (!isOpen || !assetService) return;
    let cancelled = false;

    const settings = assetService.getCollectionSettings(collectionId);
    setGridDefaults(settings.gridDefaults ?? { ...DEFAULT_GRID });
    setDefaultWidgets(settings.defaultWidgets ?? {});
    setConditions(settings.conditions ?? []);
    setVision(settings.vision);

    // Resolve collection name for the header
    assetService.getCollections().then((cols) => {
      if (cancelled) return;
      const match = cols.find((c) => c.id === collectionId);
      setCollectionName(match?.name ?? collectionId);
      setReleaseLine(match ? `v${match.version}${match.author ? ` · by ${match.author}` : ''}` : '');
    }).catch((err) => {
      console.error('[CollectionSettingsModal] Failed to load collections:', err);
    });

    return () => { cancelled = true; };
  }, [isOpen, collectionId, assetService]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!assetService) return;

    try {
      const updated: Partial<CollectionSettings> = {
        gridDefaults,
        defaultWidgets,
        conditions,
        ...(vision !== undefined && { vision }),
      };

      await assetService.updateCollectionSettings(collectionId, updated);
      onClose();
    } catch (err) {
      console.error('[CollectionSettingsModal] Failed to save:', err);
    }
  }, [assetService, collectionId, gridDefaults, defaultWidgets, conditions, vision, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="atlas-vtt-plugin atlas-vtt-root atlas-collection-settings-overlay"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="atlas-collection-settings-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="atlas-vtt-plugin atlas-collection-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-csm-title"
      >
        {/* Header */}
        <div className="atlas-collection-settings-header">
          <h3 id="atlas-csm-title">
            {collectionName} Settings
            {releaseLine && <span className="atlas-collection-settings-release">{releaseLine}</span>}
          </h3>
          <CloseButton onClick={onClose} aria-label="Close settings" />
        </div>

        {/* Body — sidebar + content */}
        <div className="atlas-collection-settings-body">
          {/* Vertical tab sidebar */}
          <nav className="atlas-collection-settings-sidebar">
            {TABS.map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                className={`atlas-collection-settings-tab ${activeTab === tab.id ? 'atlas-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </Button>
            ))}
          </nav>

          {/* Tab content */}
          <div className="atlas-collection-settings-content">
            {activeTab === 'grid' && (
              <GridMeasurementTab
                gridDefaults={gridDefaults}
                onChange={setGridDefaults}
              />
            )}
            {activeTab === 'widgets' && (
              <DefaultWidgetsTab
                defaultWidgets={defaultWidgets}
                onChange={setDefaultWidgets}
              />
            )}
            {activeTab === 'conditions' && (
              <ConditionsTab
                conditions={conditions}
                onChange={setConditions}
              />
            )}
            {activeTab === 'vision' && (
              <VisionTab
                vision={vision}
                onChange={setVision}
                unitLabel={gridDefaults.unitType === 'meters' ? 'm' : gridDefaults.unitType === 'feet' ? 'ft' : ''}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="atlas-collection-settings-footer">
          <Button variant="outline" className="atlas-csm-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" className="atlas-csm-save" onClick={() => { void handleSave(); }}>
            Save
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
