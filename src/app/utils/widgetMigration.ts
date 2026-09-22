import type { PersistedMapEnvelope } from '../services/MapPersistence';

/**
 * Migrates widgets from map-level to split storage.
 * Extracts widget values into a separate `widgetValues` map
 * so definitions and per-map values are stored independently.
 */
export function migrateWidgetsToCollection(mapData: PersistedMapEnvelope): PersistedMapEnvelope {
  const mapWidgets = mapData.state?.widgetSettings?.widgets;
  if (!mapData.state || !mapWidgets) {
    return mapData;
  }

  const widgetValues: Record<string, number> = {};
  for (const [widgetId, widget] of Object.entries(mapWidgets)) {
    widgetValues[widgetId] = widget.value;
  }

  // Keep widget definitions in widgetSettings and store the extracted values in widgetValues
  return {
    ...mapData,
    state: {
      ...mapData.state,
      widgetValues,
    }
  };
}

/**
 * Checks if a map needs widget migration
 */
export function needsWidgetMigration(mapData: PersistedMapEnvelope): boolean {
  const state = mapData.state;
  return !!(
    state?.widgetSettings?.widgets &&
    Object.keys(state.widgetSettings.widgets).length > 0 &&
    !state.widgetValues
  );
}
