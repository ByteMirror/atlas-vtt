import type { App } from 'obsidian';
import { withSystemWidgets } from '../gameSystems/systemRules';
import type { SystemPreset } from '../types/systemPresetTypes';
import type { AnyWidget } from '../types/widgetTypes';
import { AssetService } from './AssetService';
import { removeUndefinedConditions } from './collectionConditionCleanup';
import { WidgetSyncService } from './WidgetSyncService';

/**
 * Brings everything a collection's game system reaches in line with its saved
 * settings: the collection gets exactly the widgets of its preset, and tokens in
 * all its scenes lose the conditions it does not define. Runs after every save,
 * so switching systems leaves nothing of the previous one behind, and a
 * collection that drifted (e.g. edited by an older Atlas) is repaired.
 *
 * `presets` must include every preset whose widgets may still be in the
 * collection, also one that is being deleted.
 */
export async function syncCollectionSystem(app: App, collectionId: string, presets: readonly SystemPreset[]): Promise<void> {
  const assets = AssetService.getInstance(app);
  const presetId = assets.getCollectionSettings(collectionId).systemPresetId;
  const edit = (widgets: Record<string, AnyWidget>): Record<string, AnyWidget> => withSystemWidgets(widgets, presets, presetId);

  // With a map open, the widget sync writes the widgets and shows them in every open scene at once.
  const sync = WidgetSyncService.forApp(app);
  if (sync) {
    sync.editCollectionWidgets(collectionId, edit);
  } else {
    const widgets = assets.getCollectionSettings(collectionId).widgets ?? {};
    const synced = edit(widgets);
    if (synced !== widgets) await assets.updateCollectionSettings(collectionId, { widgets: synced });
  }

  await removeUndefinedConditions(app, collectionId);
}
