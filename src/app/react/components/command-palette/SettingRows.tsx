import React from 'react';
import { Check, X } from 'lucide-react';
import { Slider } from '../../../packages/components/primitives/slider';

interface SettingRowProps {
  label: string;
  hint?: string | undefined;
  children: React.ReactNode;
}

/** One settings row: name and optional hint on the left, control on the right. */
export function SettingRow({ label, hint, children }: SettingRowProps): React.ReactElement {
  return (
    <div className="atlas-setting-row">
      <div className="atlas-setting-row-info">
        <span className="atlas-setting-label">{label}</span>
        {hint && <span className="atlas-setting-hint">{hint}</span>}
      </div>
      <div className="atlas-setting-row-control">{children}</div>
    </div>
  );
}

interface SettingToggleRowProps {
  label: string;
  hint?: string | undefined;
  value: boolean;
  onToggle: () => void;
}

/** Setting row with the shared `.atlas-toggle` switch. */
export function SettingToggleRow({ label, hint, value, onToggle }: SettingToggleRowProps): React.ReactElement {
  const state = value ? 'on' : 'off';
  return (
    <SettingRow label={label} hint={hint}>
      <div
        className="atlas-toggle"
        role="switch"
        aria-checked={value}
        aria-label={label}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
      >
        <div className={`atlas-toggle__switch atlas-toggle__switch--${state}`}>
          <div className={`atlas-toggle__thumb atlas-toggle__thumb--${state}`}>
            {value ? <Check className="atlas-toggle__icon" /> : <X className="atlas-toggle__icon" />}
          </div>
        </div>
      </div>
    </SettingRow>
  );
}

interface SettingSliderRowProps {
  label: string;
  hint?: string | undefined;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
}

/** Label above a full-width slider with a monospace readout. */
export function SettingSliderRow({
  label,
  hint,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: SettingSliderRowProps): React.ReactElement {
  return (
    <div className="atlas-setting-group">
      <div className="atlas-setting-row-info">
        <span className="atlas-setting-label">{label}</span>
        {hint && <span className="atlas-setting-hint">{hint}</span>}
      </div>
      <div className="atlas-setting-slider-group">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={(next: number[]) => onChange(next[0] ?? value)}
          className="atlas-setting-slider"
          aria-label={label}
        />
        <span className="atlas-setting-value">{displayValue}</span>
      </div>
    </div>
  );
}
