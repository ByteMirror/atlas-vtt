import type { App } from 'obsidian';
import type { SenseRules, SenseRulesSource } from '../creatures/tokenSensesResolver';
import { BUILT_IN_SYSTEM_PRESETS } from '../gameSystems/builtInPresets';
import { parseUserPresets } from '../gameSystems/presetValidation';
import { collectionSenses } from '../gameSystems/senseRules';
import { GENERIC_SENSES } from '../gameSystems/senses';
import { resolveMeasurementSettings } from '../grid/measurementFormat';
import type { ViewAtlasState } from '../storeFactory';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import type { AssetService } from './AssetService';
import { SettingsService } from './SettingsService';

type MapCollections = Pick<AssetService, 'getCollectionForMap' | 'getCollectionSettings'>;
type MapState = Pick<ViewAtlasState, 'mapPath' | 'grid'>;

/**
 * The user's presets as last stored, validated once: Atlas stores a new list on every change, so
 * a list seen before holds the same presets, and their senses keep their identity for callers
 * that compare by reference.
 */
const validated = new WeakMap<object, readonly SystemPreset[]>();

function userPresets(app: App): readonly SystemPreset[] {
  const stored: unknown = SettingsService.forApp(app)?.getSetting('systemPresets');
  if (!Array.isArray(stored)) return [];
  const known = validated.get(stored);
  if (known) return known;
  const presets = parseUserPresets(stored);
  validated.set(stored, presets);
  return presets;
}

/** The presets a collection's senses may come from; the user's are read only when it names one of them. */
function presetsFor(app: App, settings: CollectionSettings): readonly SystemPreset[] {
  if (settings.senses || !settings.systemPresetId) return [];
  const builtIn = BUILT_IN_SYSTEM_PRESETS.some((preset) => preset.id === settings.systemPresetId);
  return builtIn ? BUILT_IN_SYSTEM_PRESETS : userPresets(app);
}

/**
 * What statblock senses are read with for the map in `state`: the senses of its collection and
 * what it measures in. A map outside a collection has the generic senses and its own grid units.
 * Cheap enough to call for every token: the senses are the same list while the collection's
 * settings and the stored presets are unchanged.
 */
export function mapSenseRules(app: App, assetService: MapCollections, state: MapState): SenseRules {
  const collectionId = state.mapPath ? assetService.getCollectionForMap(state.mapPath) : null;
  const settings = collectionId ? assetService.getCollectionSettings(collectionId) : undefined;
  return {
    definitions: settings ? collectionSenses(settings, presetsFor(app, settings)) : GENERIC_SENSES,
    unit: resolveMeasurementSettings(settings?.gridDefaults, state.grid),
  };
}

/**
 * The rules of the map a view shows, for `tokenSensesResolver`: read anew on every call, with a
 * subscription to what can change them, the settings of the map's collection and the user's
 * presets (any change of Atlas' settings; the resolver tells whether the rules differ).
 */
export function mapSenseRulesSource(app: App, assetService: MapCollections, state: () => MapState): Required<SenseRulesSource> {
  return {
    get: () => mapSenseRules(app, assetService, state()),
    subscribe: (listener) => {
      const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (collectionId) => {
        const { mapPath } = state();
        if (mapPath && assetService.getCollectionForMap(mapPath) === collectionId) listener();
      });
      const stopSettings = SettingsService.forApp(app)?.onChange(() => listener());
      return () => {
        app.workspace.offref(ref);
        stopSettings?.();
      };
    },
  };
}
