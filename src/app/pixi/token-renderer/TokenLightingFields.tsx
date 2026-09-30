import React, { useId } from 'react';
import { Toggle } from '../../packages/components/primitives/Toggle';
import { Select } from '../../packages/components/primitives/Select';
import { LIGHT_PRESETS, LIGHT_PRESET_IDS, type LightPresetId } from '../../lighting/lightPresets';
import type { VisionForm } from '../../lighting/tokenLighting';
import { NumberOverrideField } from './NumberOverrideField';

/** A preset, no light, or an emission edited elsewhere that saving leaves as it is. */
export type LightChoice = LightPresetId | 'none' | 'custom';

interface TokenLightingFieldsProps {
  vision: VisionForm;
  onVisionChange: (vision: VisionForm) => void;
  light: LightChoice;
  onLightChange: (light: LightChoice) => void;
  /** Game unit of the map, e.g. "ft". */
  unit: string;
}

/** The Edit Token modal's section for how the token sees and what light it carries. */
export function TokenLightingFields({ vision, onVisionChange, light, onLightChange, unit }: TokenLightingFieldsProps): React.ReactElement {
  const lightLabel = useId();
  const options = [
    { value: 'none' as const, label: 'None' },
    ...LIGHT_PRESET_IDS.map((id) => ({ value: id, label: LIGHT_PRESETS[id].label })),
    ...(light === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : []),
  ];
  return (
    <>
      <div className="atlas-edit-token__section-divider" />
      <div className="atlas-edit-token__section-label">Vision &amp; light</div>
      <div className="atlas-edit-token__field atlas-edit-token__field--row">
        <label className="atlas-edit-token__label">Vision</label>
        <Toggle
          value={vision.enabled}
          onChange={() => onVisionChange({ ...vision, enabled: !vision.enabled })}
          tooltipOn="The token sees; players see what it sees"
          tooltipOff="The token does not see"
        />
      </div>
      <NumberOverrideField
        label={`Sight range (${unit})`}
        value={vision.range}
        onChange={(range) => onVisionChange({ ...vision, range })}
        placeholder="Unlimited"
        resetLabel="Unlimited sight"
      />
      <NumberOverrideField
        label={`Darkvision (${unit})`}
        value={vision.darkvision}
        onChange={(darkvision) => onVisionChange({ ...vision, darkvision })}
        placeholder="None"
        resetLabel="No darkvision"
      />
      <NumberOverrideField
        label={`Tremorsense (${unit})`}
        value={vision.tremorsense}
        onChange={(tremorsense) => onVisionChange({ ...vision, tremorsense })}
        placeholder="None"
        resetLabel="No tremorsense"
      />
      <NumberOverrideField
        label="Vision angle (°)"
        value={vision.angle}
        onChange={(angle) => onVisionChange({ ...vision, angle })}
        placeholder="360"
        resetLabel="See all around"
        hint="Faces the token's rotation"
        min={1}
        max={360}
      />
      <div className="atlas-edit-token__field">
        <span id={lightLabel} className="atlas-edit-token__label">Carried light</span>
        <Select value={light} options={options} onChange={onLightChange} labelledBy={lightLabel} />
      </div>
    </>
  );
}
