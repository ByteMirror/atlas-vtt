import React from 'react';
import { SettingToggleRow } from './SettingRows';

type TokenToggleKey = 'showNameplates' | 'showHPBars' | 'showStressBars' | 'showInstanceBadges';

interface TokenToggle {
  key: TokenToggleKey;
  label: string;
  hint?: string;
}

// `showStressBars` is the persisted key; the resource is system-agnostic in the UI.
const LEFT_TOGGLES: ReadonlyArray<TokenToggle> = [
  { key: 'showNameplates', label: 'Show nameplates' },
  { key: 'showInstanceBadges', label: 'Show instance badges', hint: 'Numbers tokens that share an image' },
];

const RIGHT_TOGGLES: ReadonlyArray<TokenToggle> = [
  { key: 'showHPBars', label: 'Show HP bars' },
  { key: 'showStressBars', label: 'Show secondary resource bars' },
];

interface TokenSettingsPanelProps {
  view: any;
}

export function TokenSettingsPanel({ view }: TokenSettingsPanelProps): React.ReactElement {
  const tokenSettings = view?.store?.getState()?.tokenSettings || {
    showNameplates: false,
    showHPBars: true,
    showStressBars: false,
    showInstanceBadges: true,
  };

  const toggle = (key: TokenToggleKey): void => {
    if (!view?.store) return;
    const current = view.store.getState().tokenSettings || {};
    view.store.getState().setTokenSettings({ ...current, [key]: !current[key] });
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
