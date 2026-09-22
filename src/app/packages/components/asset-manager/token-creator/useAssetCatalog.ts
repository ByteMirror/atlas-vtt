import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { AssetService, type CollectionMetadata } from '../../../../services/AssetService';
import { runInBackground } from '../../../../utils/backgroundTask';

export interface AssetCatalog {
  assetService: AssetService | null;
  collections: CollectionMetadata[];
}

/** Loads the asset service and collections the creator can assign. */
export function useAssetCatalog(app: App | null | undefined, isOpen: boolean): AssetCatalog {
  const [assetService, setAssetService] = useState<AssetService | null>(null);
  const [collections, setCollections] = useState<CollectionMetadata[]>([]);

  useEffect(() => {
    if (!app) return;
    const service = AssetService.getInstance(app);
    runInBackground(service.initialize().then(() => setAssetService(service)), 'Initializing asset service');
  }, [app]);

  useEffect(() => {
    if (!assetService || !isOpen) return;
    assetService.getCollections()
      .then((data) => setCollections(data))
      .catch((error) => console.error('[TokenCreator] Error loading collections:', error));
  }, [assetService, isOpen]);

  return { assetService, collections };
}
