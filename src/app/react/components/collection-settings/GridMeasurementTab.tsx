/**
 * GridMeasurementTab — Grid unit, distance, measurement mode, and range bands
 * for collection settings.
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type {
  CollectionGridDefaults,
  GridUnitType,
  RangeBand,
} from '../../../types/collectionSettingsTypes';

interface GridMeasurementTabProps {
  gridDefaults: CollectionGridDefaults;
  onChange: (gridDefaults: CollectionGridDefaults) => void;
}

const UNIT_OPTIONS: { value: GridUnitType; label: string }[] = [
  { value: 'feet', label: 'Feet' },
  { value: 'meters', label: 'Meters' },
  { value: 'units', label: 'Units' },
  { value: 'custom', label: 'Custom' },
];

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
        <label className="atlas-csm-label">Unit Type</label>
        <select
          className="atlas-csm-select"
          value={gridDefaults.unitType}
          onChange={(e) => updateField('unitType', e.target.value as GridUnitType)}
        >
          {UNIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Distance per square */}
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">Distance per Square</label>
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

      {/* Measurement mode */}
      <div className="atlas-csm-field">
        <label className="atlas-csm-label">Measurement Mode</label>
        <div className="atlas-csm-segmented">
          <Button
            variant="ghost"
            className={`atlas-csm-segment ${gridDefaults.measurementMode === 'metric' ? 'atlas-active' : ''}`}
            onClick={() => updateField('measurementMode', 'metric')}
          >
            Metric
          </Button>
          <Button
            variant="ghost"
            className={`atlas-csm-segment ${gridDefaults.measurementMode === 'abstract' ? 'atlas-active' : ''}`}
            onClick={() => updateField('measurementMode', 'abstract')}
          >
            Abstract
          </Button>
        </div>
      </div>

      {/* Range Bands — only visible in abstract mode */}
      {gridDefaults.measurementMode === 'abstract' && (
        <div className="atlas-csm-field">
          <label className="atlas-csm-label">Range Bands</label>
          {bands.length > 0 ? (
            <div className="atlas-csm-band-list">
              {bands.map((band, i) => (
                <div key={i} className="atlas-csm-band-row">
                  <input
                    type="text"
                    className="atlas-csm-input"
                    placeholder="Band name"
                    value={band.name}
                    onChange={(e) => updateBand(i, { name: e.target.value })}
                  />
                  <input
                    type="number"
                    className="atlas-csm-input atlas-csm-input--number"
                    min={1}
                    placeholder="Max"
                    value={band.maxSquares}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isNaN(val)) updateBand(i, { maxSquares: Math.max(1, val) });
                    }}
                  />
                  <LabelTooltip label="Remove band">
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
              ))}
            </div>
          ) : (
            <div className="atlas-csm-empty">No range bands defined</div>
          )}
          <Button variant="ghost" className="atlas-csm-add-btn" onClick={addBand}>
            <Plus />
            Add Band
          </Button>
        </div>
      )}
    </>
  );
}
