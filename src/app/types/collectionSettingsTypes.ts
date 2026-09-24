/**
 * Collection Settings Types
 *
 * Per-collection configuration for game systems, measurement,
 * grid defaults, and token conditions.
 */

import type { VisionSettings } from './wallTypes';
import type { AnyWidget } from './widgetTypes';
import type { WidgetIcon } from './widgetIcons';
export type { VisionSettings } from './wallTypes';

/** A user-defined abstract distance band for the measurement tool */
export interface RangeBand {
  name: string;        // e.g. "Close"
  maxSquares: number;  // upper threshold in grid squares
}

/** A user-defined token condition, shown as a coloured badge on the token */
export interface ConditionDefinition {
  id: string;          // UUID v4
  name: string;        // e.g. "Poisoned"
  color: string;       // hex color like "#ff4444"
  /** Glyph on the badge; the badge shows the name's initial without one */
  icon?: WidgetIcon;
  /** The condition carries a number on each token, like Frightened 2 or Exhaustion 3. */
  valued?: boolean;
}

export type MeasurementMode = 'metric' | 'abstract';
export type GridUnitType = 'feet' | 'yards' | 'meters' | 'units' | 'custom';
/**
 * How diagonal steps count on square grids: `equidistant` counts each as 1 (D&D 5e),
 * `alternating` counts them 1, 2, 1, 2 (5-10-5), `euclidean` measures the straight line.
 */
export type DiagonalRule = 'equidistant' | 'alternating' | 'euclidean';

export interface CollectionGridDefaults {
  unitType: GridUnitType;
  unitDistance: number;
  measurementMode: MeasurementMode;
  abstractRangeBands?: RangeBand[];
  /** Unset means `equidistant`. */
  diagonalRule?: DiagonalRule;
}

export interface CollectionSettings {
  defaultWidgets?: Record<string, boolean>;
  /** Widgets shown in every scene of the collection; each definition holds the current value. */
  widgets?: Record<string, AnyWidget>;
  gridDefaults?: CollectionGridDefaults;
  conditions: ConditionDefinition[];
  vision?: VisionSettings;
  /** The game system preset the rules were last taken from or saved to; they may have been edited since. */
  systemPresetId?: string | undefined;
}
