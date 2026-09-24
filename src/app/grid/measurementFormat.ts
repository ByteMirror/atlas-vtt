/**
 * Turns a distance in grid cells into the label the ruler and the token drag
 * ruler show, using the collection's measurement settings or, for maps outside
 * a collection, the map's own grid units.
 */

import type { GridState } from '../services/MapPersistence';
import type {
  CollectionGridDefaults,
  DiagonalRule,
  GridUnitType,
  MeasurementMode,
  RangeBand,
} from '../types/collectionSettingsTypes';

export interface MeasurementSettings {
  mode: MeasurementMode;
  unitType: GridUnitType;
  unitDistance: number;
  diagonalRule: DiagonalRule;
  rangeBands: readonly RangeBand[];
}

/** Collection grid defaults win; a map without a collection falls back to its grid state. */
export function resolveMeasurementSettings(
  collection: CollectionGridDefaults | undefined,
  grid: GridState | null | undefined,
): MeasurementSettings {
  if (collection) {
    return {
      mode: collection.measurementMode,
      unitType: collection.unitType,
      unitDistance: collection.unitDistance,
      diagonalRule: collection.diagonalRule ?? 'equidistant',
      rangeBands: collection.abstractRangeBands ?? [],
    };
  }
  return {
    // Older maps may store 'daggerheart' or nothing; both measure in range bands.
    mode: grid?.measurementType === 'units' ? 'metric' : 'abstract',
    unitType: grid?.unitType ?? 'feet',
    unitDistance: grid?.unitDistance ?? 5,
    diagonalRule: 'equidistant',
    rangeBands: [],
  };
}

const UNIT_SUFFIX: Record<GridUnitType, string> = { feet: 'ft', yards: 'yd', meters: 'm', units: 'u', custom: '' };

/** Unit shown next to a distance input, e.g. "ft"; none for generic units. Maps without a unit use feet. */
export function unitLabelFor(unitType: GridUnitType | undefined): string {
  if (unitType === 'units' || unitType === 'custom') return '';
  return UNIT_SUFFIX[unitType ?? 'feet'];
}

/** Label for a distance of `cells` grid cells, e.g. "30ft" or a range band name. */
export function formatDistance(cells: number, settings: MeasurementSettings): string {
  if (settings.mode === 'abstract') return rangeBandName(cells, settings.rangeBands);
  return `${Math.round(cells * settings.unitDistance)}${UNIT_SUFFIX[settings.unitType]}`;
}

/** A band threshold must be a whole number of at least one square. */
export function isValidRangeBandThreshold(maxSquares: number): boolean {
  return Number.isInteger(maxSquares) && maxSquares >= 1;
}

export function areRangeBandsValid(bands: readonly RangeBand[] | undefined): boolean {
  return (bands ?? []).every(band => isValidRangeBandThreshold(band.maxSquares));
}

/** The first band whose threshold covers the distance; the last band beyond all of them. */
export function rangeBandName(cells: number, bands: readonly RangeBand[]): string {
  const squares = Math.round(cells);
  if (bands.length === 0) return `${squares} sq`;
  return (bands.find(band => squares <= band.maxSquares) ?? bands[bands.length - 1]!).name;
}
