/**
 * CollectionSettingsModal
 *
 * Vertical-tabbed modal for configuring per-collection settings:
 *   Game System | Grid & Measurement | Default Widgets | Conditions | Loot | Vision
 *
 * Opens after collection creation and via a gear button in the sidebar.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Dices, Dice5, Grid3X3, LayoutGrid, ListFilter, ShieldAlert, Eye } from 'lucide-react';
import { CoinIcon } from './CoinIcon';
import { Button } from '../../packages/components/primitives/button';
import { useAtlasUI } from '../root/AtlasUIContext';
import { AssetService } from '../../services/AssetService';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { deleteSystemPreset } from '../../services/systemPresetDeletion';
import { syncCollectionSystem } from '../../services/collectionSystemSync';
import { applyTokenBars } from '../../services/collectionTokenBars';
import { useSystemPresets } from '../hooks/useSystemPresets';
import { useCollectionSettingsDraft } from './collection-settings/useCollectionSettingsDraft';

import { GridMeasurementTab } from './collection-settings/GridMeasurementTab';
import { DefaultWidgetsTab } from './collection-settings/DefaultWidgetsTab';
import { ConditionsTab } from './collection-settings/ConditionsTab';
import { VisionTab } from './collection-settings/VisionTab';
import { LootTab } from './collection-settings/LootTab';
import { DiceTab } from './collection-settings/DiceTab';
import { SystemTab } from './collection-settings/SystemTab';
import { CreatureFiltersTab } from './collection-settings/CreatureFiltersTab';
import { useCollectionCreatures } from './collection-settings/useCollectionCreatures';
import { isCompleteCreatureFilter } from '../../creatures/creatureFilterDefinitions';
import { WALLS_AND_LIGHTING_ENABLED } from '../../featureFlags';
import { areRangeBandsValid, unitLabelFor } from '../../grid/measurementFormat';

import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';

// ── Types ──────────────────────────────────────────────────────────────────

interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  /** The tab it opens on; Game System by default. */
  initialTab?: CollectionSettingsTab;
}

export type CollectionSettingsTab = 'system' | 'grid' | 'widgets' | 'conditions' | 'creatureFilters' | 'loot' | 'dice' | 'vision';

interface TabDef {
  id: CollectionSettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'system', label: 'Game System', icon: <Dices size={16} /> },
  { id: 'grid', label: 'Grid & Measure', icon: <Grid3X3 size={16} /> },
  { id: 'widgets', label: 'Default Widgets', icon: <LayoutGrid size={16} /> },
  { id: 'conditions', label: 'Conditions', icon: <ShieldAlert size={16} /> },
  { id: 'creatureFilters', label: 'Creature Filters', icon: <ListFilter size={16} /> },
  { id: 'loot', label: 'Loot', icon: <CoinIcon size={16} /> },
  { id: 'dice', label: 'Physical Dice', icon: <Dice5 size={16} /> },
  ...(WALLS_AND_LIGHTING_ENABLED ? [{ id: 'vision' as const, label: 'Vision', icon: <Eye size={16} /> }] : []),
];

// ── Component ──────────────────────────────────────────────────────────────

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collectionId,
  initialTab = 'system',
}: CollectionSettingsModalProps): React.ReactElement | null {
  const { app } = useAtlasUI();
  const assetService = app ? AssetService.getInstance(app) : null;
  const systemPresets = useSystemPresets(app);
  const windowVariants = useDialogWindowVariants();

  const [activeTab, setActiveTab] = useState<CollectionSettingsTab>(initialTab);
  const [collectionName, setCollectionName] = useState('');
  const [releaseLine, setReleaseLine] = useState('');

  // Local draft of settings — only persisted on Save
  const draft = useCollectionSettingsDraft(assetService, collectionId, isOpen);
  const { gridDefaults, conditions } = draft;
  const collectionCreatures = useCollectionCreatures(app ?? null, assetService, collectionId, isOpen && activeTab === 'creatureFilters');

  // Resolve the collection name for the header
  useEffect(() => {
    if (!isOpen || !assetService) return;
    let cancelled = false;

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

  const canSave = areRangeBandsValid(gridDefaults.abstractRangeBands) && draft.customCreatureFilters.every(isCompleteCreatureFilter);

  const handleSave = async (): Promise<void> => {
    if (!app || !assetService || !canSave) return;

    try {
      await assetService.updateCollectionSettings(collectionId, draft.toSettings());
      // Widgets and token conditions follow the saved game system in every scene.
      await syncCollectionSystem(app, collectionId, systemPresets.presets);
      await applyTokenBars(app, collectionId, draft.tokenBarChanges());
      onClose();
    } catch (err) {
      console.error('[CollectionSettingsModal] Failed to save:', err);
    }
  };

  const handleDeletePreset = async (preset: SystemPreset): Promise<void> => {
    if (!app || !systemPresets.service) return;
    if (draft.systemPresetId === preset.id) draft.clearSystem();
    await deleteSystemPreset(app, systemPresets.service, preset.id);
  };

  if (!isOpen) return null;

  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-collection-settings-overlay"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="atlas-collection-settings-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        className="atlas-vtt-plugin atlas-collection-settings-modal"
        variants={windowVariants}
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
            {activeTab === 'system' && systemPresets.service && (
              <SystemTab
                service={systemPresets.service}
                presets={systemPresets.presets}
                rules={{ gridDefaults, conditions, defaultWidgets: draft.defaultWidgets }}
                presetId={draft.systemPresetId}
                onApplyPreset={draft.applyPreset}
                onPresetIdChange={draft.setSystemPresetId}
                onDeletePreset={handleDeletePreset}
              />
            )}
            {activeTab === 'grid' && (
              <GridMeasurementTab
                gridDefaults={gridDefaults}
                onChange={draft.setGridDefaults}
              />
            )}
            {activeTab === 'widgets' && (
              <DefaultWidgetsTab
                defaultWidgets={draft.defaultWidgets}
                onChange={draft.setDefaultWidgets}
              />
            )}
            {activeTab === 'conditions' && (
              <ConditionsTab
                conditions={conditions}
                onChange={draft.setConditions}
              />
            )}
            {activeTab === 'creatureFilters' && (
              <CreatureFiltersTab
                hidden={draft.hiddenCreatureFilters}
                onHiddenChange={draft.setHiddenCreatureFilters}
                custom={draft.customCreatureFilters}
                onCustomChange={draft.setCustomCreatureFilters}
                creatures={collectionCreatures.creatures}
                pending={collectionCreatures.pending}
              />
            )}
            {activeTab === 'loot' && app && (
              <LootTab
                app={app}
                lootBases={draft.lootBases}
                onBasesChange={draft.setLootBases}
                currency={draft.lootCurrency}
                onCurrencyChange={draft.setLootCurrency}
              />
            )}
            {activeTab === 'dice' && app && (
              <DiceTab
                app={app}
                collectionId={collectionId}
                value={draft.physicalDice}
                onChange={draft.setPhysicalDice}
              />
            )}
            {activeTab === 'vision' && (
              <VisionTab
                vision={draft.vision}
                onChange={draft.setVision}
                unitLabel={unitLabelFor(gridDefaults.unitType)}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="atlas-collection-settings-footer">
          <Button variant="outline" className="atlas-csm-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" className="atlas-csm-save" disabled={!canSave} onClick={() => { void handleSave(); }}>
            Save
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
