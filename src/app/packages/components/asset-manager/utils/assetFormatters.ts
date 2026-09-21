import { TFile, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, Asset } from '../types';
import type { AssetOfType } from '../../../../services/AssetService';

/** The stored asset types the asset manager shows, one per tab. */
export type TabServiceAsset = AssetOfType<'token' | 'map' | 'scene' | 'encounter'>;

function resourceUrl(app: ObsidianApp, path: string | undefined): string {
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  return file instanceof TFile ? app.vault.getResourcePath(file) : '';
}

function sceneThumbnailUrl(app: ObsidianApp, mapPath: string | undefined): string {
  if (!mapPath) return '';
  const thumbnailUrl = resourceUrl(app, mapPath.replace('.atlasmap', '.thumb.jpg'));
  if (thumbnailUrl) return thumbnailUrl;

  const mapFile = app.vault.getAbstractFileByPath(mapPath);
  const isImage = mapFile instanceof TFile
    && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(mapFile.extension.toLowerCase());
  return isImage ? app.vault.getResourcePath(mapFile) : '';
}

/** Derives the folder id from where the asset's file lives below the tab's base path. */
function folderIdFor(assetPath: string | undefined, tabBasePath: string): string | null {
  if (assetPath && assetPath.startsWith(tabBasePath + '/')) {
    const relativePath = assetPath.substring(tabBasePath.length + 1);
    const lastSlash = relativePath.lastIndexOf('/');
    if (lastSlash > 0) {
      return `folder-${tabBasePath}/${relativePath.substring(0, lastSlash)}`;
    }
  }
  return null;
}

/**
 * Converts a single AssetService record into the UI-layer AnyAsset shape,
 * resolving vault resource paths for thumbnails / images.
 */
export function formatServiceAsset(
  asset: TabServiceAsset,
  tabBasePath: string,
  app: ObsidianApp
): AnyAsset {
  const assetPath = asset.type === 'token' ? asset.imagePath : asset.filePath;
  const base: Omit<Asset, 'type' | 'thumbnailUrl'> = {
    id: asset.id,
    name: asset.name,
    tags: asset.tags,
    folderId: folderIdFor(assetPath, tabBasePath),
    ...(asset.filePath !== undefined && { filePath: asset.filePath }),
  };

  switch (asset.type) {
    case 'token': {
      const imageUrl = resourceUrl(app, asset.imagePath);
      return {
        ...base,
        type: 'tokens',
        thumbnailUrl: imageUrl,
        imageUrl,
        imagePath: asset.imagePath,
        ...(asset.statblockPath !== undefined && { statblockPath: asset.statblockPath }),
      };
    }
    case 'map': {
      const imageUrl = resourceUrl(app, asset.mapFilePath);
      return {
        ...base,
        type: 'maps',
        thumbnailUrl: resourceUrl(app, asset.thumbnailPath) || imageUrl,
        imageUrl,
        mapFilePath: asset.mapFilePath,
      };
    }
    case 'scene':
      return { ...base, type: 'scenes', thumbnailUrl: sceneThumbnailUrl(app, asset.data?.mapPath) };
    case 'encounter': {
      // Older encounters keep these only inside their JSON payload.
      const description = asset.data?.description;
      const difficulty = asset.difficulty || asset.data?.difficulty;
      const formation = asset.formation || asset.data?.formation;
      return {
        ...base,
        type: 'encounters',
        thumbnailUrl: asset.thumbnailUrl ?? '',
        tokens: asset.tokens || asset.data?.tokens || [],
        ...(description !== undefined && { description }),
        ...(difficulty !== undefined && { difficulty }),
        ...(formation !== undefined && { formation }),
      };
    }
  }
}
