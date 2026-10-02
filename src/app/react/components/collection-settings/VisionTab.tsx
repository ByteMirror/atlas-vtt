/**
 * VisionTab — What new tokens of a collection start with: sight range, darkvision,
 * tremorsense and vision cone. Vision itself stays off until switched on per token.
 */

import { t } from '../../../i18n';
import React, { useState } from 'react';
import { unitLabelFor } from '../../../grid/measurementFormat';
import { hasVisionDefaults } from '../../../gameSystems/visionDefaults';
import {
  VISION_FIELDS,
  visionDefaultsForm,
  visionDefaultsFromForm,
  visionFieldLabel,
  type VisionDefaultsForm,
} from '../../../lighting/tokenLighting';
import { NumberOverrideField } from '../../../pixi/token-renderer/NumberOverrideField';
import type { CollectionGridDefaults } from '../../../types/collectionSettingsTypes';
import type { TokenVisionDefaults } from '../../../types/lightingTypes';

interface VisionTabProps {
  gridDefaults: CollectionGridDefaults;
  vision: TokenVisionDefaults | undefined;
  onChange: (vision: TokenVisionDefaults | undefined) => void;
}

export function VisionTab({ gridDefaults, vision, onChange }: VisionTabProps): React.ReactElement {
  const [form, setForm] = useState<VisionDefaultsForm>(() => visionDefaultsForm(vision));
  // The default this form shows; it differs from `vision` only when the draft changed it from outside, e.g. loaded after mount.
  const [shown, setShown] = useState(vision);
  const unit = unitLabelFor(gridDefaults.unitType);

  if (vision !== shown) {
    setShown(vision);
    setForm(visionDefaultsForm(vision));
  }

  const update = (key: keyof VisionDefaultsForm, value: string): void => {
    const next = { ...form, [key]: value };
    const defaults = visionDefaultsFromForm(next);
    const edited = hasVisionDefaults(defaults) ? defaults : undefined;
    setForm(next);
    setShown(edited);
    onChange(edited);
  };

  return (
    <>
      <p className="atlas-csm-hint">
        {t('vision.defaultsIntro')}
      </p>
      {VISION_FIELDS.map((field) => (
        <NumberOverrideField
          key={field.key}
          label={visionFieldLabel(field, unit)}
          value={form[field.key]}
          onChange={(value) => update(field.key, value)}
          placeholder={field.placeholder}
          resetLabel={field.resetLabel}
          {...(field.hint && { hint: field.hint })}
          {...(field.min !== undefined && { min: field.min })}
          {...(field.max !== undefined && { max: field.max })}
        />
      ))}
    </>
  );
}
