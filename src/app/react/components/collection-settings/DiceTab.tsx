/**
 * DiceTab: how the collection's physical dice look and read. The packs
 * themselves are managed in the asset manager's Dice tab.
 */

import React, { useId } from 'react';
import type { App } from 'obsidian';
import type { PhysicalDiceSettings } from '../../../types/collectionSettingsTypes';
import { Select } from '../../../packages/components/primitives/Select';
import { Slider } from '../../../packages/components/primitives/slider';
import { resolvePhysicalDice } from '../../../physical-dice/physicalDiceSettings';
import { useDicePacks } from '../../../physical-dice/useDicePacks';

interface DiceTabProps {
  app: App;
  collectionId: string;
  value: PhysicalDiceSettings | undefined;
  onChange: (value: PhysicalDiceSettings) => void;
}

interface SliderFieldProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function SliderField({ label, hint, value, min, max, step, onChange }: SliderFieldProps): React.ReactElement {
  const labelId = useId();
  return (
    <div className="atlas-csm-field">
      <div className="atlas-csm-dice-slider-head">
        <label id={labelId} className="atlas-csm-label">{label}</label>
        <span className="atlas-csm-dice-slider-value">{value.toFixed(step < 0.1 ? 2 : 1)}</span>
      </div>
      <p className="atlas-csm-hint">{hint}</p>
      <Slider
        aria-labelledby={labelId}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  );
}

interface ToggleFieldProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleField({ label, hint, checked, onChange }: ToggleFieldProps): React.ReactElement {
  return (
    <div className="atlas-csm-toggle-row">
      <div>
        <div className="atlas-csm-toggle-label">{label}</div>
        <div className="atlas-csm-hint">{hint}</div>
      </div>
      <label className="atlas-csm-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="atlas-csm-switch-track" />
      </label>
    </div>
  );
}

export function DiceTab({ app, collectionId, value, onChange }: DiceTabProps): React.ReactElement {
  const dice = resolvePhysicalDice(value);
  const { packs } = useDicePacks(app, collectionId);
  const packLabelId = useId();

  const update = (partial: Partial<PhysicalDiceSettings>): void => onChange({ ...dice, ...partial });

  const packOptions = packs.map((pack) => ({ value: pack.id, label: pack.name }));
  // A chosen pack that is gone falls back to the built-in one on the table.
  const packValue = packs.some((pack) => pack.id === (dice.pack ?? '')) ? (dice.pack ?? '') : '';

  return (
    <>
      <p className="atlas-csm-hint">
        How this collection&apos;s physical dice look and read, when the dice panel is set to Physical.
        Add or remove dice packs in the asset manager&apos;s Dice tab.
      </p>

      <div className="atlas-csm-field">
        <label id={packLabelId} className="atlas-csm-label">Dice pack</label>
        <p className="atlas-csm-hint">The face sheets and finish the dice wear.</p>
        <Select
          value={packValue}
          options={packOptions.length ? packOptions : [{ value: '', label: 'Default' }]}
          onChange={(pack) => update({ pack: pack || undefined })}
          labelledBy={packLabelId}
        />
      </div>

      <SliderField
        label="Dice size" hint="How big the dice are on the table."
        value={dice.diceSize} min={0.3} max={2} step={0.1}
        onChange={(diceSize) => update({ diceSize })}
      />

      <ToggleField
        label="Shadows" hint="A soft shadow under each die."
        checked={dice.enableShadows} onChange={(enableShadows) => update({ enableShadows })}
      />

      <SliderField
        label="Ambient light" hint="Overall brightness. Keep it low so the key light shapes the dice."
        value={dice.ambientLightIntensity} min={0} max={3} step={0.05}
        onChange={(ambientLightIntensity) => update({ ambientLightIntensity })}
      />

      <SliderField
        label="Key light" hint="The light from above that gives the dice their edges."
        value={dice.directionalLightIntensity} min={0} max={5} step={0.1}
        onChange={(directionalLightIntensity) => update({ directionalLightIntensity })}
      />

      <SliderField
        label="Settle patience" hint="How still the dice must be before they are read. Higher waits longer."
        value={dice.motionThreshold} min={0.1} max={10} step={0.1}
        onChange={(motionThreshold) => update({ motionThreshold })}
      />

      <SliderField
        label="Face tolerance"
        hint="How squarely a face must sit to count. Stricter catches more dice for a reroll."
        value={dice.faceDetectionTolerance} min={0.05} max={0.5} step={0.05}
        onChange={(faceDetectionTolerance) => update({ faceDetectionTolerance })}
      />

      <ToggleField
        label="Highlight read dice" hint="Tint each die once it has a reading."
        checked={dice.highlightCompletedDice}
        onChange={(highlightCompletedDice) => update({ highlightCompletedDice })}
      />

      {dice.highlightCompletedDice && (
        <div className="atlas-csm-field">
          <label className="atlas-csm-label">Highlight colour</label>
          <input
            type="color"
            className="atlas-csm-dice-color"
            value={dice.completedDiceHighlightColor}
            onChange={(e) => update({ completedDiceHighlightColor: e.target.value })}
          />
        </div>
      )}
    </>
  );
}
