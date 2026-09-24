import { createContext, useContext } from 'react';
import type { AnyAsset, Tag } from '../types';

/** The tags of the active tab's tag group and how a card's tag menu changes them. */
export interface AssetTagMenuActions {
  tags: readonly Tag[];
  setAssetTags: (asset: AnyAsset, tags: string[]) => Promise<void>;
  /** Resolves to null when the tag could not be created. */
  createTag: (name: string) => Promise<Tag | null>;
}

const noTagActions: AssetTagMenuActions = {
  tags: [],
  setAssetTags: async (): Promise<void> => {},
  createTag: async (): Promise<null> => null,
};

// Provided by the asset manager, so cards receive only primitives and stay memoized.
export const AssetTagMenuContext = createContext<AssetTagMenuActions>(noTagActions);

export function useAssetTagMenuActions(): AssetTagMenuActions {
  return useContext(AssetTagMenuContext);
}
