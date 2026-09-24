/**
 * DefaultWidgetsTab — Toggle default widgets for new maps in a collection.
 */

import React from 'react';

interface DefaultWidgetsTabProps {
  defaultWidgets: Record<string, boolean>;
  onChange: (widgets: Record<string, boolean>) => void;
}

/** Available widget definitions for the MVP. */
const WIDGET_OPTIONS: { key: string; label: string; description: string }[] = [
  {
    key: 'initiativeTracker',
    label: 'Initiative Tracker',
    description: 'Turn-order tracker for combat encounters',
  },
  {
    key: 'hpBar',
    label: 'HP Bar',
    description: 'Health bar displayed under tokens',
  },
  {
    key: 'stressBar',
    label: 'Secondary resource bar',
    description: 'Secondary resource (stress, sanity, mana…) shown under tokens',
  },
  {
    key: 'timer',
    label: 'Timer',
    description: 'Countdown timer for timed encounters or breaks',
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
        Resource bars follow these settings in every scene of the collection,
        also scenes that already exist. The other defaults apply to new maps.
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
