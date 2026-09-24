/**
 * Game system presets: a named set of collection rules (measurement and
 * conditions) that can be applied to any collection.
 */

import type { CollectionGridDefaults, ConditionDefinition } from './collectionSettingsTypes';
import type { AnyWidget } from './widgetTypes';

/** The parts of a collection's settings that a game system defines. */
export interface SystemRules {
  gridDefaults: CollectionGridDefaults;
  conditions: ConditionDefinition[];
  /**
   * Collection-wide widgets the system adds, e.g. Shadowdark's torch timer. They
   * follow the preset: switching to another system removes them. Not part of
   * the rules compared by `sameSystemRules`, since the widgets run on their own.
   */
  widgets?: AnyWidget[];
  /**
   * What new scenes of the collection show and use, by key as in
   * `CollectionSettings.defaultWidgets` (e.g. `stressBar` for Daggerheart's Stress).
   */
  defaultWidgets?: Record<string, boolean>;
}

/** Built-in preset ids start with this; user presets never do. */
export const BUILT_IN_ID_PREFIX = 'builtin:';

export interface SystemPreset {
  id: string;
  name: string;
  /** Shipped with the plugin: read-only, with an id that stays the same across releases and vaults. */
  builtIn: boolean;
  rules: SystemRules;
}
