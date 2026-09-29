import React, { useCallback, useEffect, useState } from 'react';
import { MonitorUp } from 'lucide-react';
import { App, Notice } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { PlayerWindowService } from '../../../services/PlayerWindowService';
import { presentActiveTabInPlayerWindow } from '../../../services/PlayerWindowPresenter';
import { SettingsService, type AtlasSettings } from '../../../services/SettingsService';
import { SettingRow, SettingToggleRow } from './SettingRows';
import { t } from '../../../i18n';

const DEFAULT_LOCAL_PLAYER_VIEW_SETTINGS = {
  showToolbar: false,
  showTokenHP: false,
  showTokenStress: false,
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
  { key: 'showGrid', label: t('grid.show') },
  { key: 'showWidgets', label: t('lpv.showWidgets') },
  { key: 'showInitiative', label: t('lpv.showInitiative') },
  { key: 'showDiceRolls', label: t('lpv.showDiceRolls') },
];

const TOKEN_TOGGLES: ReadonlyArray<{ key: LocalPlayerViewToggleKey; label: string }> = [
  { key: 'showTokenHP', label: t('tokens.showHP') },
  { key: 'showTokenStress', label: t('tokens.showSecondary') },
  { key: 'showTokenNameplates', label: t('tokens.showNameplates') },
];

function openPlayerWindow(app: App): void {
  if (PlayerWindowService.getInstance()?.isWindowOpen()) {
    new Notice(t('lpv.alreadyOpen'));
    return;
  }
  void presentActiveTabInPlayerWindow(app);
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
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.interface')}</h3>
        {UI_TOGGLES.map(renderToggle)}
      </div>

      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.tokens')}</h3>
        {TOKEN_TOGGLES.map(renderToggle)}
        <SettingRow label={t('lpv.notePreviews')} hint={t('lpv.notePreviewsHint')}>{null}</SettingRow>

        <Button variant="default" size="sm" className="atlas-command-palette-cta" onClick={() => openPlayerWindow(app)}>
          <MonitorUp />
          {t('lpv.openWindow')}
        </Button>
      </div>
    </div>
  );
}
