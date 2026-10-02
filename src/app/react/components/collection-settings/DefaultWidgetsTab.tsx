/**
 * DefaultWidgetsTab — Toggle default widgets for new maps in a collection.
 */

import React from 'react';
import { t } from '../../../i18n';

interface DefaultWidgetsTabProps {
  defaultWidgets: Record<string, boolean>;
  onChange: (widgets: Record<string, boolean>) => void;
}

/** Available widget definitions for the MVP. */
const WIDGET_OPTIONS: { key: string; label: string; description: string }[] = [
  {
    key: 'initiativeTracker',
    label: t('csm.widgets.initiative'),
    description: t('csm.widgets.initiativeDesc'),
  },
  {
    key: 'hpBar',
    label: t('csm.widgets.hp'),
    description: t('csm.widgets.hpDesc'),
  },
  {
    key: 'stressBar',
    label: t('csm.widgets.secondary'),
    description: t('csm.widgets.secondaryDesc'),
  },
  {
    key: 'timer',
    label: t('csm.widgets.timer'),
    description: t('csm.widgets.timerDesc'),
  },
];

export function DefaultWidgetsTab({
  defaultWidgets,
  onChange,
}: DefaultWidgetsTabProps): React.ReactElement {
  const toggle = (key: string): void => {
    onChange({ ...defaultWidgets, [key]: !defaultWidgets[key] });
  };

  return (
    <>
      <p className="atlas-csm-hint">
        {t('csm.widgets.intro')}
      </p>
      {WIDGET_OPTIONS.map((w) => (
        <div key={w.key} className="atlas-csm-toggle-row">
          <div>
            <div className="atlas-csm-toggle-label">{w.label}</div>
            <div className="atlas-csm-hint">{w.description}</div>
          </div>
          <label className="atlas-csm-switch">
            <input
              type="checkbox"
              checked={!!defaultWidgets[w.key]}
              onChange={() => toggle(w.key)}
            />
            <span className="atlas-csm-switch-track" />
          </label>
        </div>
      ))}
    </>
  );
}
