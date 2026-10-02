import React, { useId } from 'react';
import { Toggle } from '../../packages/components/primitives/Toggle';
import { Select } from '../../packages/components/primitives/Select';
import { LIGHT_PRESETS, LIGHT_PRESET_IDS, type LightPresetId } from '../../lighting/lightPresets';
import { VISION_FIELDS, visionFieldLabel, type VisionForm } from '../../lighting/tokenLighting';
import { NumberOverrideField } from './NumberOverrideField';
import { t } from '../../i18n';

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
  const visionLabel = useId();
  const options = [
    { value: 'none' as const, label: t('common.none') },
    ...LIGHT_PRESET_IDS.map((id) => ({ value: id, label: LIGHT_PRESETS[id].label })),
    ...(light === 'custom' ? [{ value: 'custom' as const, label: t('light.custom') }] : []),
  ];
  return (
    <>
      <div className="atlas-edit-token__section-divider" />
      <div className="atlas-edit-token__section-label">{t('vision.sectionLabel')}</div>
      <div className="atlas-edit-token__field atlas-edit-token__field--row">
        <span id={visionLabel} className="atlas-edit-token__label">{t('vision.toggle')}</span>
        <Toggle
          labelledBy={visionLabel}
          value={vision.enabled}
          onChange={() => onVisionChange({ ...vision, enabled: !vision.enabled })}
          tooltipOn={t('vision.toggleOn')}
          tooltipOff={t('vision.toggleOff')}
        />
      </div>
      {VISION_FIELDS.map((field) => (
        <NumberOverrideField
          key={field.key}
          label={visionFieldLabel(field, unit)}
          value={vision[field.key]}
          onChange={(value) => onVisionChange({ ...vision, [field.key]: value })}
          placeholder={field.placeholder}
          resetLabel={field.resetLabel}
          {...(field.hint && { hint: field.hint })}
          {...(field.min !== undefined && { min: field.min })}
          {...(field.max !== undefined && { max: field.max })}
        />
      ))}
      <div className="atlas-edit-token__field">
        <span id={lightLabel} className="atlas-edit-token__label">{t('vision.carriedLight')}</span>
        <Select value={light} options={options} onChange={onLightChange} labelledBy={lightLabel} />
      </div>
    </>
  );
}
