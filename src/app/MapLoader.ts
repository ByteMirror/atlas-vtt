import { App, TFile, normalizePath } from 'obsidian';
import { Assets, Texture } from 'pixi.js';
import type { MapFile } from './services/MapPersistence';
import { migrateMapFile, isLegacyMapFile, isPersistedMapEnvelope } from './services/MapPersistence';
import { AssetValidationService, type MissingAsset } from './services/AssetValidationService';

export interface LoadedMap {
  mapData: MapFile;
  texture: InstanceType<typeof Texture>;
  hasBackground: boolean; // Indicate if this is a real background or placeholder
  missingAssets?: MissingAsset[]; // Track missing assets for reporting
}

/**
 * Pure helper that reads the .atlasmap JSON and preloads the background image as a PIXI texture.
 * All vault / IO logic lives here so AtlasView remains an orchestrator only.
 */
export class MapLoader {
  static async load(app: App, mapFilePath: string): Promise<LoadedMap> {
    const assetValidationService = new AssetValidationService({ app });
    // Read and parse the map JSON file from the vault
    const file = app.vault.getAbstractFileByPath(normalizePath(mapFilePath));
    if (!(file instanceof TFile)) {
      throw new Error(`[MapLoader] Map file not found: ${mapFilePath}`);
    }
    const raw = await app.vault.read(file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('[MapLoader] Failed to parse map JSON');
    }
    // Support Zustand persist format: wrap under `state` key
    const data = isPersistedMapEnvelope(parsed) && parsed.state ? parsed.state : parsed;
    if (!isLegacyMapFile(data)) {
      throw new Error('[MapLoader] Map file has an unexpected structure');
    }

    // Apply migration to convert app:// URLs to relative paths
    const mapData = migrateMapFile(data);

    let texture: Texture;
    let hasBackground = false;

    const validationResult = await assetValidationService.validateMapAssets(mapData);
    if (!validationResult.valid) {
      assetValidationService.showMissingAssetsNotice(validationResult.missingAssets);
    }
    
    if (mapData.background) {
      // Preload background image as a PIXI texture
      const imgFile = app.vault.getAbstractFileByPath(normalizePath(mapData.background));
      if (!(imgFile instanceof TFile)) {
        console.error(`[MapLoader] Background image not found: ${mapData.background}`);
        const placeholder = assetValidationService.getMissingAssetPlaceholder();
        texture = placeholder ? await Assets.load<Texture>(placeholder) : createPlaceholderTexture(mapData);
        hasBackground = false;
      } else {
        const url = app.vault.adapter.getResourcePath(imgFile.path);
        texture = await Assets.load<Texture>(url);
        hasBackground = true;
      }
    } else {
      // Create a placeholder texture for maps without backgrounds
      texture = createPlaceholderTexture(mapData);
      hasBackground = false;
    }

    return { 
      mapData, 
      texture, 
      hasBackground,
      missingAssets: validationResult.missingAssets
    };
  }
}

/** Transparent 20x20-cell texture for maps without a background image. */
function createPlaceholderTexture(mapData: MapFile): Texture {
  const gridSize = mapData.grid?.size || 70;
  const canvas = createEl('canvas');
  canvas.width = gridSize * 20;
  canvas.height = gridSize * 20;
  return canvas.getContext('2d') ? Texture.from(canvas) : Texture.EMPTY;
}
