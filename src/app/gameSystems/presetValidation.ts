/**
 * Reads user presets from the settings file. The file can be edited by hand or
 * written by an older or newer Atlas, so every field is checked and an entry
 * that cannot be used is left out instead of breaking the list.
 */

import { isValidRangeBandThreshold } from '../grid/measurementFormat';
import type {
  CollectionGridDefaults,
  ConditionDefinition,
  DiagonalRule,
  GridUnitType,
  MeasurementMode,
  RangeBand,
} from '../types/collectionSettingsTypes';
import { BUILT_IN_ID_PREFIX, type SystemPreset } from '../types/systemPresetTypes';
import { WIDGET_ICON_PATHS, resolveWidgetIcon, type WidgetIcon } from '../types/widgetIcons';
import type { AnyWidget } from '../types/widgetTypes';

const UNIT_TYPES: readonly GridUnitType[] = ['feet', 'yards', 'meters', 'units', 'custom'];
const MEASUREMENT_MODES: readonly MeasurementMode[] = ['metric', 'abstract'];
const DIAGONAL_RULES: readonly DiagonalRule[] = ['equidistant', 'alternating', 'euclidean'];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (options as readonly string[]).includes(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseBand(raw: unknown): RangeBand | null {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.maxSquares !== 'number') return null;
  return isValidRangeBandThreshold(raw.maxSquares) ? { name: raw.name, maxSquares: raw.maxSquares } : null;
}

function parseGridDefaults(raw: unknown): CollectionGridDefaults | null {
  if (!isRecord(raw)) return null;
  const { unitType, unitDistance, measurementMode, diagonalRule, abstractRangeBands } = raw;
  if (!isOneOf(UNIT_TYPES, unitType) || !isOneOf(MEASUREMENT_MODES, measurementMode)) return null;
  if (typeof unitDistance !== 'number' || !(unitDistance > 0)) return null;
  const bands = Array.isArray(abstractRangeBands) ? abstractRangeBands.map(parseBand) : [];
  if (bands.some((band) => band === null)) return null;
  return {
    unitType,
    unitDistance,
    measurementMode,
    diagonalRule: isOneOf(DIAGONAL_RULES, diagonalRule) ? diagonalRule : 'equidistant',
    abstractRangeBands: bands as RangeBand[],
  };
}

function parseCondition(raw: unknown): ConditionDefinition | null {
  if (!isRecord(raw) || !isNonEmptyString(raw.id) || typeof raw.name !== 'string') return null;
  if (typeof raw.color !== 'string' || !HEX_COLOR.test(raw.color)) return null;
  const icon = typeof raw.icon === 'string' && raw.icon in WIDGET_ICON_PATHS ? (raw.icon as WidgetIcon) : undefined;
  return { id: raw.id, name: raw.name, color: raw.color, ...(icon && { icon }), ...(raw.valued === true && { valued: true }) };
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A widget the preset adds to collections; always collection-wide. */
function parseWidget(raw: unknown): AnyWidget | null {
  if (!isRecord(raw) || !isNonEmptyString(raw.id) || typeof raw.label !== 'string' || !isNumber(raw.value)) return null;
  const base = {
    id: raw.id,
    label: raw.label,
    icon: resolveWidgetIcon(typeof raw.icon === 'string' ? raw.icon : undefined),
    visible: raw.visible !== false,
    visibleToPlayers: raw.visibleToPlayers !== false,
    value: raw.value,
    order: isNumber(raw.order) ? raw.order : 0,
    scope: 'collection' as const,
    ...(typeof raw.color === 'string' && { color: raw.color }),
  };
  if (raw.type === 'timer') {
    return isNumber(raw.duration) && raw.duration > 0
      ? { ...base, type: 'timer', duration: raw.duration, direction: 'down' }
      : null;
  }
  if (raw.type !== 'counter') return null;
  return {
    ...base,
    type: 'counter',
    ...(isNumber(raw.min) && { min: raw.min }),
    ...(isNumber(raw.max) && { max: raw.max }),
  };
}

/** The keys of `raw` that are `true`; anything else is left out. */
function parseEnabledFlags(raw: unknown): Record<string, boolean> {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, on]) => on === true).map(([key]) => [key, true]));
}

/** A stored user preset, or null when it cannot be used. */
export function parseUserPreset(raw: unknown): SystemPreset | null {
  if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.name) || !isRecord(raw.rules)) return null;
  if (raw.id.startsWith(BUILT_IN_ID_PREFIX)) return null;
  const gridDefaults = parseGridDefaults(raw.rules.gridDefaults);
  if (!gridDefaults || !Array.isArray(raw.rules.conditions)) return null;
  const conditions = raw.rules.conditions.map(parseCondition).filter((c): c is ConditionDefinition => c !== null);
  const widgets = Array.isArray(raw.rules.widgets)
    ? raw.rules.widgets.map(parseWidget).filter((w): w is AnyWidget => w !== null)
    : [];
  const defaultWidgets = parseEnabledFlags(raw.rules.defaultWidgets);
  return {
    id: raw.id,
    name: raw.name.trim(),
    builtIn: false,
    rules: {
      gridDefaults,
      conditions,
      ...(widgets.length > 0 && { widgets }),
      ...(Object.keys(defaultWidgets).length > 0 && { defaultWidgets }),
    },
  };
}

/** Every usable preset in `raw`, the first one kept when ids repeat. */
export function parseUserPresets(raw: unknown): SystemPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap((entry) => {
    const preset = parseUserPreset(entry);
    if (!preset || seen.has(preset.id)) return [];
    seen.add(preset.id);
    return [preset];
  });
}
