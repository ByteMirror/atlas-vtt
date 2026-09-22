import { Notice, TFile, type App } from 'obsidian';
import type { AnyAsset } from '../types';
import { spawnTokenAsset, spawnEncounterTokens, type SpawnContext } from '../utils/tokenSpawnService';
import type { AssetService } from '../../../../services/AssetService';
import type { AtlasView } from '../../../../atlas-view';
import type { ViewAtlasState } from '../../../../storeFactory';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';

export interface OpenAssetDeps {
  app: App;
  view: AtlasView | null;
  addToken: ViewAtlasState['addToken'];
  setSelection: (ids: string[]) => void;
  assetService: AssetService | null;
  onClose: () => void;
}

export type OpenAsset = (asset: AnyAsset, spawnCount: number) => Promise<void>;

async function openScene(deps: OpenAssetDeps, assetId: string): Promise<void> {
  const serviceAsset = await deps.assetService?.getAssetById(assetId);
  if (serviceAsset?.type !== 'scene' || !serviceAsset.data?.mapPath) return;
  const file = deps.app.vault.getAbstractFileByPath(serviceAsset.data.mapPath);
  if (!(file instanceof TFile)) return;
  await deps.app.workspace.getLeaf(false).openFile(file);
  deps.onClose();
}

/**
 * The primary action of an asset (double-click or its spawn button): tokens
 * and encounters spawn on the map, scenes open, maps start a new scene.
 * The returned function keeps one identity across renders.
 */
export function useOpenAsset(deps: OpenAssetDeps): OpenAsset {
  return useStableCallback(async (asset: AnyAsset, spawnCount: number): Promise<void> => {
    const spawnCtx: SpawnContext = {
      app: deps.app, view: deps.view, addToken: deps.addToken, setSelection: deps.setSelection, assetService: deps.assetService,
    };
    switch (asset.type) {
      case 'maps':
        window.dispatchEvent(new CustomEvent('create-scene-from-map', {
          detail: { backgroundPath: asset.mapFilePath, defaultName: asset.name },
        }));
        return;
      case 'tokens': {
        const ids = await spawnTokenAsset(spawnCtx, asset, Math.max(1, spawnCount));
        if (ids.length > 0) deps.onClose();
        return;
      }
      case 'scenes':
        await openScene(deps, asset.id);
        return;
      case 'encounters': {
        const ids = await spawnEncounterTokens(spawnCtx, asset);
        const expected = asset.tokens.length;
        new Notice(ids.length < expected
          ? `Spawned ${ids.length} of ${expected} tokens from "${asset.name}" (some had missing images)`
          : `Spawned ${ids.length} tokens from "${asset.name}"`);
      }
    }
  });
}
