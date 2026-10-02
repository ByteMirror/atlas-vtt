import { useMemo } from 'react';
import { useCollectionRulesRevision } from '../react/hooks/useCollectionRulesRevision';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';
import { AssetService } from '../services/AssetService';
import { mapResources } from './collectionResources';
import type { ResourceDefinition } from './resourceTypes';

/** The resources of the collection the view's map belongs to; follows edits to the collection's settings and the loading of the asset index. */
export function useMapResources(): readonly ResourceDefinition[] {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const revision = useCollectionRulesRevision(app);

  return useMemo(
    () => (app ? mapResources(AssetService.getInstance(app), mapPath) : []),
    // `revision` stands for the collection's settings and the asset index, which are read here.
    [app, mapPath, revision],
  );
}
