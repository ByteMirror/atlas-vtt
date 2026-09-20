/**
 * VisionTab — Dynamic vision settings for a collection.
 *
 * Values are stored in game units (feet/meters/units) matching the grid
 * settings. The conversion to world pixels happens in collectVisionSources().
 */

import React from 'react';
import type { VisionSettings } from '../../../types/collectionSettingsTypes';

const DEFAULT_VISION: VisionSettings = {
  enabled: false,
  defaultInnerRadius: 30,   // 30 game units (e.g. 30 ft — standard D&D darkvision)
  defaultOuterRadius: 60,   // 60 game units
};

interface VisionTabProps {
  vision: VisionSettings | undefined;
  onChange: (vision: VisionSettings) => void;
  /** Grid unit label (e.g. "ft", "m", "") derived from grid settings */
  unitLabel?: string;
}

export function VisionTab({ vision, onChange, unitLabel = 'ft' }: VisionTabProps): React.ReactElement {
  const settings = vision ?? DEFAULT_VISION;

  const update = (partial: Partial<VisionSettings>): void => {
    onChange({ ...settings, ...partial });
  };

  const unit = unitLabel ? ` (${unitLabel})` : '';

  return (
    <>
      <p className="atlas-csm-hint">
        Enable dynamic vision to restrict what players can see based on token
        sight lines and walls. Distances use the same units as your grid
        settings{unitLabel ? ` (${unitLabel})` : ''}.
      </p>

      {/* Enable toggle */}
      <div className="atlas-csm-toggle-row">
        <div>
          <div className="atlas-csm-toggle-label">Enable Dynamic Vision</div>
          <div className="atlas-csm-hint">
            Tokens will only reveal areas within their vision radius
          </div>
        </div>
        <label className="atlas-csm-switch">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
          />
          <span className="atlas-csm-switch-track" />
        </label>
      </div>

      {/* Radius inputs — only shown when vision is enabled */}
      {settings.enabled && (
        <>
          <div className="atlas-csm-field">
            <label className="atlas-csm-label">Bright Vision Range{unit}</label>
            <p className="atlas-csm-hint">
              How far tokens can see clearly (default: 30{unitLabel ? ` ${unitLabel}` : ''})
            </p>
            <input
              type="number"
              className="atlas-csm-input atlas-csm-input--number"
              min={1}
              value={settings.defaultInnerRadius}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!Number.isNaN(val)) update({ defaultInnerRadius: Math.max(1, val) });
              }}
            />
          </div>

          <div className="atlas-csm-field">
            <label className="atlas-csm-label">Dim Vision Range{unit}</label>
            <p className="atlas-csm-hint">
              How far tokens can see dimly — leave blank to disable
            </p>
            <input
              type="number"
              className="atlas-csm-input atlas-csm-input--number"
              min={1}
              placeholder="—"
              value={settings.defaultOuterRadius ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  update({ defaultOuterRadius: undefined });
                } else {
                  const val = Number(raw);
                  if (!Number.isNaN(val)) update({ defaultOuterRadius: Math.max(1, val) });
                }
              }}
            />
          </div>
        </>
      )}
    </>
  );
}
