import { useMemo } from 'react';
import { DEFAULT_INITIATIVE_RULES } from '../gameSystems/initiativeRules';
import { useCollectionRulesRevision } from '../react/hooks/useCollectionRulesRevision';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore } from '../react/ViewStoreContext';
import { mapInitiativeRules } from '../services/mapInitiativeRules';
import type { InitiativeRules } from '../types/initiativeRulesTypes';

/** The initiative rules of the collection the view's map belongs to; follows edits to the collection's settings and the loading of the asset index. */
export function useMapInitiativeRules(): InitiativeRules {
  const { app } = useAtlasUI();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const revision = useCollectionRulesRevision(app);

  return useMemo(
    () => (app ? mapInitiativeRules(app, mapPath) : { ...DEFAULT_INITIATIVE_RULES }),
    // `revision` stands for the collection's settings and the asset index, which are read here.
    [app, mapPath, revision],
  );
}
