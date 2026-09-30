/**
 * VisionTab — What new tokens of a collection start with: sight range, darkvision,
 * tremorsense and vision cone. Vision itself stays off until switched on per token.
 */

import React, { useId, useState } from 'react';
import { unitLabelFor } from '../../../grid/measurementFormat';
import { visionDefaultsForm, visionDefaultsFromForm, type VisionDefaultsForm } from '../../../lighting/tokenLighting';
import { hasVisionDefaults } from '../../../gameSystems/visionDefaults';
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import type { TokenVisionDefaults } from '../../../types/lightingTypes';

interface VisionTabProps {
  gridDefaults: CollectionGridDefaults;
  vision: TokenVisionDefaults | undefined;
  onChange: (vision: TokenVisionDefaults | undefined) => void;
}

interface VisionFieldProps {
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}

function VisionField({ label, value, placeholder, hint, min = 0, max, onChange }: VisionFieldProps): React.ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="atlas-csm-field">
      <label className="atlas-csm-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        className="atlas-csm-input atlas-csm-input--vision"
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p id={hintId} className="atlas-csm-hint">{hint}</p>}
    </div>
  );
}

export function VisionTab({ gridDefaults, vision, onChange }: VisionTabProps): React.ReactElement {
  const [form, setForm] = useState<VisionDefaultsForm>(() => visionDefaultsForm(vision));
  const unit = unitLabelFor(gridDefaults.unitType);
  const distanceLabel = (name: string): string => (unit ? `${name} (${unit})` : name);

  const update = (key: keyof VisionDefaultsForm, value: string): void => {
    const next = { ...form, [key]: value };
    setForm(next);
    const defaults = visionDefaultsFromForm(next);
    onChange(hasVisionDefaults(defaults) ? defaults : undefined);
  };

  return (
    <>
      <p className="atlas-csm-hint">
        New tokens start with these values; vision itself stays off until you switch it on for a token.
      </p>
      <VisionField
        label={distanceLabel('Sight range')}
        value={form.range}
        placeholder="Unlimited"
        onChange={(value) => update('range', value)}
      />
      <VisionField
        label={distanceLabel('Darkvision')}
        value={form.darkvision}
        placeholder="None"
        onChange={(value) => update('darkvision', value)}
      />
      <VisionField
        label={distanceLabel('Tremorsense')}
        value={form.tremorsense}
        placeholder="None"
        onChange={(value) => update('tremorsense', value)}
      />
      <VisionField
        label="Vision angle (°)"
        value={form.angle}
        placeholder="360"
        hint="Faces the token's rotation"
        min={1}
        max={360}
        onChange={(value) => update('angle', value)}
      />
    </>
  );
}
