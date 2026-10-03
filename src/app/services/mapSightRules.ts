import type { App } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { SightRules } from '../vision/sightRules';
import { AssetService } from './AssetService';
import { mapSenseRules } from './mapSenseRules';

/**
 * What sight goes by for the map in `state`: the senses of its collection (the same list
 * statblock senses are read with, `mapSenseRules`) and its conditions; the generic senses and no
 * conditions for a map outside a collection. `visionOf` is how each token perceives, where that
 * follows a linked statblock.
 */
export function mapSightRules(app: App, state: Pick<ViewAtlasState, 'mapPath' | 'grid'>, visionOf?: SightRules['visionOf']): SightRules {
  const assets = AssetService.getInstance(app);
  const collectionId = state.mapPath ? assets.getCollectionForMap(state.mapPath) : null;
  return {
    definitions: mapSenseRules(app, assets, state).definitions,
    conditions: collectionId ? assets.getCollectionSettings(collectionId).conditions ?? [] : [],
    ...(visionOf && { visionOf }),
  };
}
