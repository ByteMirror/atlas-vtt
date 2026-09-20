import { App, TFile, normalizePath } from 'obsidian';
import { Assets, Texture, Graphics } from 'pixi.js';
import type { MapFile } from './services/MapPersistence';
import { migrateMapFile } from './services/MapPersistence';
import { AssetValidationService } from './services/AssetValidationService';

export interface LoadedMap {
  mapData: MapFile;
  texture: InstanceType<typeof Texture>;
  hasBackground: boolean; // Indicate if this is a real background or placeholder
  missingAssets?: any[]; // Track missing assets for reporting
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
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('[MapLoader] Failed to parse map JSON');
    }
    // Support Zustand persist format: wrap under `state` key
    const data = parsed.state ?? parsed;
    
    // Apply migration to convert app:// URLs to relative paths
    const version = parsed.version ?? data.version ?? 0;
    const migratedData = migrateMapFile(data, version);
    
    const mapData: MapFile = migratedData;

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
        texture = placeholder ? await Assets.load(placeholder) : await createPlaceholderTexture(app, mapData);
        hasBackground = false;
      } else {
        const url = app.vault.adapter.getResourcePath(imgFile.path);
        texture = await Assets.load(url);
        hasBackground = true;
      }
    } else {
      // Create a placeholder texture for maps without backgrounds
      texture = await createPlaceholderTexture(app, mapData);
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

// Helper function to create placeholder texture
async function createPlaceholderTexture(app: App, mapData: MapFile): Promise<Texture> {
  const gridSize = mapData.grid?.size || 70;
  const defaultWidth = gridSize * 20; // 20x20 grid as default
  const defaultHeight = gridSize * 20;
  
  const graphics = new Graphics();
  graphics.rect(0, 0, defaultWidth, defaultHeight);
  graphics.fill({ color: 0xffffff, alpha: 0 }); // Transparent fill
  
  // Create texture from graphics
  let texture = (app as any).renderer?.generateTexture(graphics) || Texture.EMPTY;
  if (texture === Texture.EMPTY) {
    // Fallback: create a minimal texture
    const canvas = createEl('canvas');
    canvas.width = defaultWidth;
    canvas.height = defaultHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Create transparent canvas
      ctx.clearRect(0, 0, defaultWidth, defaultHeight);
      texture = Texture.from(canvas);
    } else {
      // Create an empty transparent texture
      texture = Texture.EMPTY;
    }
  }
  
  return texture;
}