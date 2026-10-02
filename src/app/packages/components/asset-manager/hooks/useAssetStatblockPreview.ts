import type { App } from 'obsidian';
import type { AnyAsset } from '../types';
import { useModHoverStatblockPreview } from './useModHoverStatblockPreview';

export interface AssetStatblockPreviewOptions {
  app: App;
  /** The scrolling pane that holds the asset cards. */
  container: HTMLElement | null;
  assets: AnyAsset[];
  /** Set while assets are selected or dragged: Mod then belongs to the selection. */
  suspended: boolean;
}

/** Shows the statblock of the token card under the pointer while Mod is held. */
export function useAssetStatblockPreview({ app, container, assets, suspended }: AssetStatblockPreviewOptions): void {
  useModHoverStatblockPreview({
    app,
    container,
    suspended,
    cardSelector: '.atlas-asset-card',
    targetOf: (card) => {
      const asset = assets.find(({ id }) => id === card.dataset.assetId);
      if (asset?.type !== 'tokens' || !asset.statblockPath) return null;
      const token = { name: asset.name, imagePath: asset.imagePath, showRing: asset.showRing };
      return { key: asset.id, notePath: asset.statblockPath, token };
    },
  });
}
