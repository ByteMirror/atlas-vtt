import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';

interface NumberOverrideFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Shown while the field is empty, e.g. the inherited default. */
  placeholder: string;
  resetLabel: string;
}

/** Numeric input whose empty state falls back to an inherited default; a clear button restores it. */
export function NumberOverrideField({ label, value, onChange, placeholder, resetLabel }: NumberOverrideFieldProps): React.ReactElement {
  return (
    <div className="atlas-edit-token__field">
      <label className="atlas-edit-token__label">{label}</label>
      <div className="atlas-edit-token__input-row">
        <input
          type="number"
          className="atlas-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={0}
        />
        {value !== '' && (
          <LabelTooltip label={resetLabel}>
            <Button variant="ghost" size="icon" className="atlas-edit-token__clear-btn" onClick={() => onChange('')}>
              <X size={12} />
            </Button>
          </LabelTooltip>
        )}
      </div>
    </div>
  );
}

export function parseNumberInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}
