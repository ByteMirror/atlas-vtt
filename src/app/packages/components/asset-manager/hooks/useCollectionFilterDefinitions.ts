import { useEffect, useMemo, useState } from 'react';
import type { App } from 'obsidian';
import { CATALOG_CREATURE_FILTERS } from '../../../../creatures/creatureFieldCatalog';
import { collectionCreatureFilters } from '../../../../creatures/creatureFilterDefinitions';
import type { AssetService } from '../../../../services/AssetService';
import type { CreatureFilterDefinition } from '../../../../types/creatureFilterTypes';

/** The creature filters a collection offers, kept current as its settings are saved. */
export function useCollectionFilterDefinitions(
  app: App,
  assetService: AssetService | null,
  collectionId: string,
): readonly CreatureFilterDefinition[] {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const ref = app.workspace.on('atlas-vtt:collection-settings-changed', (changed) => {
      if (changed === collectionId) setRevision((value) => value + 1);
    });
    return () => app.workspace.offref(ref);
  }, [app, collectionId]);

  return useMemo(() => {
    if (!assetService) return CATALOG_CREATURE_FILTERS;
    return collectionCreatureFilters(assetService.getCollectionSettings(collectionId));
    // `revision` stands for the collection settings, which are read here.
  }, [assetService, collectionId, revision]);
}
