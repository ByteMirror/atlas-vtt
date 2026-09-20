/**
 * Collection Settings Types
 *
 * Per-collection configuration for game systems, measurement,
 * grid defaults, and token conditions.
 */

import type { VisionSettings } from './wallTypes';
export type { VisionSettings } from './wallTypes';

/** A user-defined abstract distance band for the measurement tool */
export interface RangeBand {
  name: string;        // e.g. "Close"
  maxSquares: number;  // upper threshold in grid squares
}

/** A user-defined token condition with a color indicator */
export interface ConditionDefinition {
  id: string;          // UUID v4
  name: string;        // e.g. "Poisoned"
  color: string;       // hex color like "#ff4444"
}

export type MeasurementMode = 'metric' | 'abstract';
export type GridUnitType = 'feet' | 'meters' | 'units' | 'custom';

export interface CollectionGridDefaults {
  unitType: GridUnitType;
  unitDistance: number;
  measurementMode: MeasurementMode;
  abstractRangeBands?: RangeBand[];
}

export interface CollectionSettings {
  defaultWidgets?: Record<string, boolean>;
  gridDefaults?: CollectionGridDefaults;
  conditions: ConditionDefinition[];
  vision?: VisionSettings;
}
