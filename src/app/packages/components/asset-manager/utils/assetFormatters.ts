import { TFile, App as ObsidianApp } from 'obsidian';
import type { AnyAsset, Asset } from '../types';
import type { Asset as ServiceAsset, AssetOfType, TokenAsset as ServiceTokenAsset } from '../../../../services/AssetService';

/** The stored asset types the asset manager shows, one per tab. */
export type TabServiceAsset = AssetOfType<'token' | 'map' | 'scene' | 'encounter'>;

/** Stored assets grouped by the tab that shows them. */
export interface AssetsByTab {
  tokens: AssetOfType<'token'>[];
  maps: AssetOfType<'map'>[];
  scenes: AssetOfType<'scene'>[];
  encounters: AssetOfType<'encounter'>[];
}

/** Thumbnail vault path per token image path, for tokens that have one. */
export type TokenThumbnailPaths = ReadonlyMap<string, string>;

const NO_THUMBNAILS: TokenThumbnailPaths = new Map();
const ENCOUNTER_PREVIEW_COUNT = 3;

export function resourceUrl(app: ObsidianApp, path: string | undefined): string {
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

/** Groups stored assets by the tab that shows them; other asset types are left out. */
export function partitionByTab(assets: readonly ServiceAsset[]): AssetsByTab {
  const byTab: AssetsByTab = { tokens: [], maps: [], scenes: [], encounters: [] };
  for (const asset of assets) {
    switch (asset.type) {
      case 'token': byTab.tokens.push(asset); break;
      case 'map': byTab.maps.push(asset); break;
      case 'scene': byTab.scenes.push(asset); break;
      case 'encounter': byTab.encounters.push(asset); break;
      default: break;
    }
  }
  return byTab;
}

export function tokenThumbnailPaths(tokens: readonly ServiceTokenAsset[]): TokenThumbnailPaths {
  const paths = new Map<string, string>();
  for (const token of tokens) {
    if (token.thumbnailPath) paths.set(token.imagePath, token.thumbnailPath);
  }
  return paths;
}

/** Preview image per token reference, using the token's thumbnail where one exists. */
function tokenPreviewUrl(app: ObsidianApp, imagePath: string | undefined, thumbnails: TokenThumbnailPaths): string {
  if (!imagePath) return '';
  return resourceUrl(app, thumbnails.get(imagePath)) || resourceUrl(app, imagePath);
}

/**
 * Converts a single AssetService record into the UI-layer AnyAsset shape,
 * resolving vault resource paths for thumbnails / images.
 */
export function formatServiceAsset(
  asset: TabServiceAsset,
  tabBasePath: string,
  app: ObsidianApp,
  thumbnails: TokenThumbnailPaths = NO_THUMBNAILS,
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
        thumbnailUrl: resourceUrl(app, asset.thumbnailPath) || imageUrl,
        imageUrl,
        imagePath: asset.imagePath,
        ...(asset.showRing !== undefined && { showRing: asset.showRing }),
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
      const tokens = asset.tokens || asset.data?.tokens || [];
      const tokenPreviewUrls = tokens
        .map((token) => tokenPreviewUrl(app, token.imagePath, thumbnails))
        .filter((url) => url !== '')
        .slice(0, ENCOUNTER_PREVIEW_COUNT);
      return {
        ...base,
        type: 'encounters',
        thumbnailUrl: asset.thumbnailUrl ?? '',
        tokens,
        tokenPreviewUrls,
        ...(description !== undefined && { description }),
        ...(difficulty !== undefined && { difficulty }),
        ...(formation !== undefined && { formation }),
      };
    }
  }
}
