import type { AnyWidget } from '../types/widgetTypes';

/**
 * Migrates widgets from map-level to split storage.
 * Extracts widget values into a separate `widgetValues` map
 * so definitions and per-map values are stored independently.
 */
export async function migrateWidgetsToCollection(
  _plugin: any,
  mapData: any,
  _collectionId: string
): Promise<any> {
  if (!mapData.state?.widgetSettings?.widgets) {
    return mapData;
  }

  // Extract widget values from the map
  const mapWidgets = mapData.state.widgetSettings.widgets;
  const widgetValues: Record<string, any> = {};

  for (const [widgetId, widget] of Object.entries(mapWidgets)) {
    const anyWidget = widget as AnyWidget;
    widgetValues[widgetId] = anyWidget.value;
  }

  // Update map data: keep widget definitions in widgetSettings and
  // store extracted values in the new widgetValues field
  const updatedMapData = {
    ...mapData,
    state: {
      ...mapData.state,
      widgetValues,
    }
  };

  return updatedMapData;
}

/**
 * Checks if a map needs widget migration
 */
export function needsWidgetMigration(mapData: any): boolean {
  return !!(
    mapData.state?.widgetSettings?.widgets &&
    Object.keys(mapData.state.widgetSettings.widgets).length > 0 &&
    !mapData.state.widgetValues
  );
}
