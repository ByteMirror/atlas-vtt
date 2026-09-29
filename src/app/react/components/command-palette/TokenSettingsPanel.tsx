import React from 'react';
import { SettingToggleRow } from './SettingRows';
import type { AtlasView } from '../../../atlas-view';
import { t } from '../../../i18n';

type TokenToggleKey = 'showNameplates' | 'showHPBars' | 'showStressBars' | 'showInstanceBadges';

interface TokenToggle {
  key: TokenToggleKey;
  label: string;
  hint?: string;
}

// `showStressBars` is the persisted key; the resource is system-agnostic in the UI.
const LEFT_TOGGLES: ReadonlyArray<TokenToggle> = [
  { key: 'showNameplates', label: t('tokens.showNameplates') },
  { key: 'showInstanceBadges', label: t('tokens.showBadges'), hint: t('tokens.showBadgesHint') },
];

const RIGHT_TOGGLES: ReadonlyArray<TokenToggle> = [
  { key: 'showHPBars', label: t('tokens.showHP') },
  { key: 'showStressBars', label: t('tokens.showSecondary') },
];

interface TokenSettingsPanelProps {
  view: AtlasView | null;
}

export function TokenSettingsPanel({ view }: TokenSettingsPanelProps): React.ReactElement {
  const tokenSettings = view?.atlasStore?.getState()?.tokenSettings || {
    showNameplates: false,
    showHPBars: true,
    showStressBars: false,
    showInstanceBadges: true,
  };

  const toggle = (key: TokenToggleKey): void => {
    if (!view?.atlasStore) return;
    const current = view.atlasStore.getState().tokenSettings || {};
    view.atlasStore.getState().setTokenSettings({ ...current, [key]: !current[key] });
  };

  const renderToggle = ({ key, label, hint }: TokenToggle): React.ReactElement => (
    <SettingToggleRow
      key={key}
      label={label}
      hint={hint}
      value={Boolean(tokenSettings[key])}
      onToggle={() => toggle(key)}
    />
  );

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">{LEFT_TOGGLES.map(renderToggle)}</div>
      <div className="atlas-command-palette-panel-column">{RIGHT_TOGGLES.map(renderToggle)}</div>
    </div>
  );
}
