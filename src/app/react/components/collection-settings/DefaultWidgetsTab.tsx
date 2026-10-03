/**
 * DefaultWidgetsTab — Toggle default widgets for new maps in a collection, and how its initiative tracker runs a fight.
 */

import React from 'react';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import { InitiativeFields } from './InitiativeFields';

interface DefaultWidgetsTabProps {
  defaultWidgets: Record<string, boolean>;
  onChange: (widgets: Record<string, boolean>) => void;
  initiative: InitiativeRules;
  onInitiativeChange: (initiative: InitiativeRules) => void;
}

/** Available widget definitions for the MVP. */
const WIDGET_OPTIONS: { key: string; label: string; description: string }[] = [
  {
    key: 'initiativeTracker',
    label: 'Initiative Tracker',
    description: 'Turn-order tracker for combat encounters',
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
  initiative,
  onInitiativeChange,
}: DefaultWidgetsTabProps): React.ReactElement {
  const toggle = (key: string): void => {
    onChange({ ...defaultWidgets, [key]: !defaultWidgets[key] });
  };

  return (
    <>
      <p className="atlas-csm-hint">
        These defaults apply to new maps of the collection.
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
      <InitiativeFields initiative={initiative} onChange={onInitiativeChange} />
    </>
  );
}
