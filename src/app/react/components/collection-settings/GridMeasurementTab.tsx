/**
 * GridMeasurementTab — Grid unit, distance, measurement mode, and range bands
 * for collection settings.
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { areRangeBandsValid, isValidRangeBandThreshold } from '../../../grid/measurementFormat';
import type {
  CollectionGridDefaults,
  DiagonalRule,
  GridUnitType,
  MeasurementMode,
  RangeBand,
} from '../../../types/collectionSettingsTypes';
import { t } from '../../../i18n';

const MEASUREMENT_MODES: readonly SegmentedOption<MeasurementMode>[] = [
  { value: 'metric', label: t('csm.grid.metric') },
  { value: 'abstract', label: t('csm.grid.abstract') },
];

interface GridMeasurementTabProps {
  gridDefaults: CollectionGridDefaults;
  onChange: (gridDefaults: CollectionGridDefaults) => void;
}

const UNIT_OPTIONS: Record<GridUnitType, string> = {
  feet: t('csm.grid.unit.feet'),
  yards: t('csm.grid.unit.yards'),
  meters: t('csm.grid.unit.meters'),
  units: t('csm.grid.unit.units'),
  custom: t('csm.grid.unit.custom'),
};

const DIAGONAL_OPTIONS: Record<DiagonalRule, string> = {
  equidistant: t('csm.grid.diagonal.equidistant'),
  alternating: t('csm.grid.diagonal.alternating'),
  euclidean: t('csm.grid.diagonal.euclidean'),
};

export function GridMeasurementTab({
  gridDefaults,
  onChange,
}: GridMeasurementTabProps): React.ReactElement {
  const updateField = <K extends keyof CollectionGridDefaults>(
    key: K,
    value: CollectionGridDefaults[K],
  ): void => {
    onChange({ ...gridDefaults, [key]: value });
  };

  const bands = gridDefaults.abstractRangeBands ?? [];
  const bandsValid = areRangeBandsValid(bands);

  const updateBand = (index: number, partial: Partial<RangeBand>): void => {
    const updated = bands.map((b, i) => (i === index ? { ...b, ...partial } : b));
    updateField('abstractRangeBands', updated);
  };

  const addBand = (): void => {
    updateField('abstractRangeBands', [...bands, { name: '', maxSquares: 1 }]);
  };

  const removeBand = (index: number): void => {
    updateField(
      'abstractRangeBands',
      bands.filter((_, i) => i !== index),
    );
  };

  return (
    <>
      {/* Unit type */}
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">{t('csm.grid.unitType')}</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={gridDefaults.unitType}
          options={UNIT_OPTIONS}
          onChange={(value) => updateField('unitType', value as GridUnitType)}
        />
      </div>

      {/* Distance per square */}
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">{t('csm.grid.distance')}</label>
        <input
          type="number"
          className="atlas-csm-input atlas-csm-input--number"
          min={1}
          value={gridDefaults.unitDistance}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!Number.isNaN(val)) updateField('unitDistance', Math.max(1, val));
          }}
        />
      </div>

      {/* Diagonal rule (square grids; hex grids always count hex steps) */}
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">{t('csm.grid.diagonal')}</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={gridDefaults.diagonalRule ?? 'equidistant'}
          options={DIAGONAL_OPTIONS}
          onChange={(value) => updateField('diagonalRule', value as DiagonalRule)}
        />
      </div>

      {/* Measurement mode */}
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">{t('csm.grid.mode')}</label>
        <SegmentedControl
          ariaLabel={t('csm.grid.mode')}
          value={gridDefaults.measurementMode}
          options={MEASUREMENT_MODES}
          onChange={(mode) => updateField('measurementMode', mode)}
        />
      </div>

      {/* Range Bands — only visible in abstract mode */}
      {gridDefaults.measurementMode === 'abstract' && (
        <div className="atlas-csm-field">
          <label className="atlas-csm-label">{t('csm.grid.bands')}</label>
          {bands.length > 0 ? (
            <div className="atlas-csm-band-list">
              {bands.map((band, i) => {
                const thresholdValid = isValidRangeBandThreshold(band.maxSquares);
                return (
                  <div key={i} className="atlas-csm-band-row">
                    <input
                      type="text"
                      className="atlas-csm-input"
                      placeholder={t('csm.grid.bandName')}
                      value={band.name}
                      onChange={(e) => updateBand(i, { name: e.target.value })}
                    />
                    <input
                      type="number"
                      className="atlas-csm-input atlas-csm-input--number"
                      min={1}
                      step={1}
                      placeholder={t('csm.grid.max')}
                      aria-invalid={!thresholdValid || undefined}
                      value={Number.isNaN(band.maxSquares) ? '' : band.maxSquares}
                      onChange={(e) => {
                        // Keep whatever was typed, even an empty field; Save stays disabled until it is valid.
                        const raw = e.target.value.trim();
                        updateBand(i, { maxSquares: raw === '' ? NaN : Number(raw) });
                      }}
                    />
                    <LabelTooltip label={t('csm.grid.removeBand')}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="atlas-csm-band-delete"
                        onClick={() => removeBand(i)}
                      >
                        <Trash2 />
                      </Button>
                    </LabelTooltip>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="atlas-csm-empty">{t('csm.grid.noBands')}</div>
          )}
          {!bandsValid && (
            <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">
              {t('csm.grid.bandsInvalid')}
            </p>
          )}
          <Button variant="ghost" className="atlas-csm-add-btn" onClick={addBand}>
            <Plus />
            {t('csm.grid.addBand')}
          </Button>
        </div>
      )}
    </>
  );
}
