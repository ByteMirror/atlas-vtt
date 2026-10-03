import { GENERIC_LIGHT_PRESETS } from '../../gameSystems/lightPresets/generic';
import { lightPresetsOnMap } from '../../lighting/lightPresetChoice';
import { mapLightPresets } from '../../services/mapCollectionRules';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import { useAtlasUI } from '../root/AtlasUIContext';
import { useAtlasStore } from '../ViewStoreContext';

/** A 5-foot grid, for a toolbar that has no Obsidian app to ask about its map. */
const FALLBACK_UNIT = { unitType: 'feet', unitDistance: 5 } as const;

/** The light presets offered on the view's map, in what the map measures in (`mapLightPresets`). */
export function useMapLightPresets(): readonly LightPresetDefinition[] {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const grid = useAtlasStore((state) => state.grid);
  return app ? mapLightPresets(app, { mapPath, grid }) : lightPresetsOnMap(GENERIC_LIGHT_PRESETS, FALLBACK_UNIT, Infinity);
}
