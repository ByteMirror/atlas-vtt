import React, { useCallback, useEffect, useState } from 'react';
import { MonitorUp } from 'lucide-react';
import { App, Notice } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { slottedResources } from '../../../resources/resourceSlots';
import { shapeOf } from '../../../resources/visibleResources';
import { useMapResources } from '../../../resources/useMapResources';
import { AssetService } from '../../../services/AssetService';
import { runInBackground } from '../../../utils/backgroundTask';
import { PlayerWindowService } from '../../../services/PlayerWindowService';
import { presentActiveTabInPlayerWindow } from '../../../services/PlayerWindowPresenter';
import { SettingsService, type AtlasSettings } from '../../../services/SettingsService';
import { SettingRow, SettingToggleRow } from './SettingRows';

const DEFAULT_LOCAL_PLAYER_VIEW_SETTINGS = {
  showToolbar: false,
  showTokenNameplates: false,
  showNotePreviews: false,
  showGrid: true,
  showWidgets: true,
  showInitiative: true,
  showDiceRolls: false,
  showCommandPalette: false,
};

type LocalPlayerViewSettings = AtlasSettings['localPlayerView'];
type LocalPlayerViewToggleKey = Exclude<keyof LocalPlayerViewSettings, 'showToolbar' | 'showCommandPalette' | 'showNotePreviews'>;

const UI_TOGGLES: ReadonlyArray<{ key: LocalPlayerViewToggleKey; label: string }> = [
  { key: 'showGrid', label: 'Show grid' },
  { key: 'showWidgets', label: 'Show widgets' },
  { key: 'showInitiative', label: 'Show initiative panel' },
  { key: 'showDiceRolls', label: 'Show dice rolls' },
];

const TOKEN_TOGGLES: ReadonlyArray<{ key: LocalPlayerViewToggleKey; label: string }> = [
  { key: 'showTokenNameplates', label: 'Show nameplates' },
];

function openPlayerWindow(app: App): void {
  if (PlayerWindowService.getInstance()?.isWindowOpen()) {
    new Notice('Player window is already open');
    return;
  }
  void presentActiveTabInPlayerWindow(app);
}

/**
 * One switch per bar of the open scene's collection: whether players see it. Wheels show on
 * hover and selection only, which the player window has not, so they have no switch.
 */
function PlayerBarToggles({ app }: { app: App }): React.ReactElement | null {
  const resources = useMapResources();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const assets = AssetService.getInstance(app);
  const collectionId = mapPath ? assets.getCollectionForMap(mapPath) : null;
  if (!collectionId) return null;

  const toggle = (key: string): void => {
    const next = resources.map((resource) => (
      resource.key === key ? { ...resource, visibleToPlayers: !resource.visibleToPlayers } : resource
    ));
    runInBackground(assets.updateCollectionSettings(collectionId, { resources: next }), 'Saving what players see');
  };

  return (
    <>
      {slottedResources(resources).filter(({ slot }) => shapeOf(slot) === 'bar').map(({ definition: resource }) => (
        <SettingToggleRow
          key={resource.key}
          label={`Show ${resource.name} bars`}
          value={resource.visibleToPlayers}
          onToggle={() => toggle(resource.key)}
        />
      ))}
    </>
  );
}

export function LocalPlayerViewSettingsPanel(): React.ReactElement {
  const { app, view } = useAtlasUI();
  const settingsService: SettingsService | undefined = view?.serviceManager?.getSettingsService();
  const [localSettings, setLocalSettings] = useState<LocalPlayerViewSettings>(
    () => settingsService?.getLocalPlayerViewSettings() || DEFAULT_LOCAL_PLAYER_VIEW_SETTINGS,
  );

  useEffect(() => {
    if (!settingsService) return;
    setLocalSettings(settingsService.getLocalPlayerViewSettings());
    return settingsService.onChange(settings => setLocalSettings(settings.localPlayerView));
  }, [settingsService]);

  const updateSettings = useCallback(
    (updates: Partial<LocalPlayerViewSettings>): void => {
      if (settingsService) {
        settingsService.setLocalPlayerViewSettings(updates);
      }
    },
    [settingsService],
  );

  const renderToggle = ({ key, label }: { key: LocalPlayerViewToggleKey; label: string }): React.ReactElement => (
    <SettingToggleRow
      key={key}
      label={label}
      value={localSettings[key]}
      onToggle={() => updateSettings({ [key]: !localSettings[key] })}
    />
  );

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">Interface</h3>
        {UI_TOGGLES.map(renderToggle)}
      </div>

      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">Tokens</h3>
        <PlayerBarToggles app={app} />
        {TOKEN_TOGGLES.map(renderToggle)}
        <SettingRow label="Note previews" hint="Note previews are not shared with the player window.">{null}</SettingRow>

        <Button variant="default" size="sm" className="atlas-command-palette-cta" onClick={() => openPlayerWindow(app)}>
          <MonitorUp />
          Open player window
        </Button>
      </div>
    </div>
  );
}
