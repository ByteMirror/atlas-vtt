import { TFile, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, Tab } from '../types';
import type {
  Asset as ServiceAsset,
  EncounterAsset as ServiceEncounterAsset,
} from '../../../../services/AssetService';

/**
 * Converts a single AssetService record into the UI-layer AnyAsset shape,
 * resolving vault resource paths for thumbnails / images.
 */
export function formatServiceAsset(
  asset: ServiceAsset,
  activeTab: Tab,
  tabBasePath: string,
  app: ObsidianApp
): AnyAsset {
  let thumbnailUrl = '';
  let imageUrl = '';
  const assetFilePath = (asset as ServiceAsset & { filePath?: string }).filePath;

  // ── Token ──────────────────────────────────────────────────────
  if (asset.type === 'token') {
    const file = app.vault.getAbstractFileByPath(asset.imagePath);
    if (file instanceof TFile) {
      thumbnailUrl = app.vault.getResourcePath(file);
      imageUrl = thumbnailUrl;
    }
  }

  // ── Map ────────────────────────────────────────────────────────
  if (asset.type === 'map') {
    const mapFile = app.vault.getAbstractFileByPath(asset.mapFilePath);
    if (mapFile instanceof TFile) {
      imageUrl = app.vault.getResourcePath(mapFile);
      thumbnailUrl = imageUrl;
    }
    if (asset.thumbnailPath) {
      const thumbFile = app.vault.getAbstractFileByPath(asset.thumbnailPath);
      if (thumbFile instanceof TFile) {
        thumbnailUrl = app.vault.getResourcePath(thumbFile);
      }
    }
  }

  // ── Scene ──────────────────────────────────────────────────────
  if (asset.type === 'scene') {
    const sceneAsset = asset as ServiceAsset & { data?: { mapPath?: string } };
    if (sceneAsset.data?.mapPath) {
      const thumbnailPath = sceneAsset.data.mapPath.replace('.atlasmap', '.thumb.jpg');
      const thumbFile = app.vault.getAbstractFileByPath(thumbnailPath);
      if (thumbFile instanceof TFile) {
        thumbnailUrl = app.vault.getResourcePath(thumbFile);
        imageUrl = thumbnailUrl;
      } else {
        const mapFile = app.vault.getAbstractFileByPath(sceneAsset.data.mapPath);
        if (mapFile instanceof TFile) {
          const ext = mapFile.extension.toLowerCase();
          if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
            imageUrl = app.vault.getResourcePath(mapFile);
            thumbnailUrl = imageUrl;
          }
        }
      }
    }
  }

  // ── Encounter ──────────────────────────────────────────────────
  if (asset.type === 'encounter') {
    const encounterAsset = asset as ServiceAsset & { thumbnailUrl?: string };
    if (encounterAsset.thumbnailUrl) {
      thumbnailUrl = encounterAsset.thumbnailUrl;
      imageUrl = encounterAsset.thumbnailUrl;
    }
  }

  // ── Derive folderId from file location ────────────────────────
  const folderId = ((): string | null => {
    const assetPath =
      asset.type === 'token'
        ? asset.imagePath
        : assetFilePath ?? null;
    if (assetPath && assetPath.startsWith(tabBasePath + '/')) {
      const relativePath = assetPath.substring(tabBasePath.length + 1);
      const lastSlash = relativePath.lastIndexOf('/');
      if (lastSlash > 0) {
        const folderVaultPath = tabBasePath + '/' + relativePath.substring(0, lastSlash);
        return `folder-${folderVaultPath}`;
      }
    }
    return null;
  })();

  return {
    id: asset.id,
    name: asset.name,
    type: activeTab,
    thumbnailUrl,
    imageUrl,
    tags: asset.tags,
    filePath: assetFilePath,
    folderId,
    // Token-specific fields
    ...(asset.type === 'token' && {
      statblockPath: (asset as ServiceAsset & { statblockPath?: string }).statblockPath,
      imagePath: asset.imagePath,
    }),
    // Encounter-specific fields
    ...(asset.type === 'encounter' && {
      tokens:
        (asset as ServiceEncounterAsset).tokens ||
        (asset as ServiceAsset & { data?: { tokens?: any[] } }).data?.tokens ||
        [],
      description:
        (asset as any).description ||
        (asset as ServiceAsset & { data?: { description?: string } }).data?.description,
      difficulty:
        (asset as any).difficulty ||
        (asset as ServiceAsset & { data?: { difficulty?: string } }).data?.difficulty,
      formation:
        (asset as ServiceEncounterAsset).formation ||
        (asset as ServiceAsset & { data?: { formation?: unknown } }).data?.formation,
    }),
  } as AnyAsset;
}
