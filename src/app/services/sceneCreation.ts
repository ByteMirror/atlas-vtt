import { App, TFile, normalizePath } from 'obsidian';
import { AssetService } from './AssetService';
import { tokenBarsOf, withTokenBars } from './collectionTokenBars';
import { normalizeImagePath } from '../utils/pathUtils';
import { ensureFolder } from '../plugin/vaultFolders';

/** Where a collection keeps the `.atlasmap` of a scene called `name`. */
export function sceneFilePath(collectionId: string, name: string): string {
  return normalizePath(`atlas-vtt/collections/${collectionId}/scenes/${name}.atlasmap`);
}

export interface NewScene {
  app: App;
  assetService: AssetService;
  /** Scene name, already trimmed; also the file name. */
  name: string;
  collectionId: string;
  /** Map image or video the scene opens on, if it starts with one. */
  backgroundPath?: string | null | undefined;
  tags?: readonly string[] | undefined;
}

/**
 * The state of a scene that has just been created: an empty map on the collection's
 * measurement and resource bars, with its grid still to be aligned to the background.
 */
function newSceneState(assetService: AssetService, collectionId: string, backgroundPath: string | null): Record<string, unknown> {
  const grid: Record<string, unknown> = {
    enabled: true,
    visible: true,
    snapToGrid: true,
    type: 'square',
    size: 70,
    offsetX: 0,
    offsetY: 0,
    opacity: 0.5,
    lineType: 'solid' as const,
    lineWidth: 1,
    // The first GM load measures the real cell size off the background, so a map
    // brings its own grid rather than starting on a default that rarely fits.
    autoDetect: true,
  };

  const settings = assetService.getCollectionSettings(collectionId);
  if (settings.gridDefaults) {
    const defaults = settings.gridDefaults;
    Object.assign(grid, {
      unitType: defaults.unitType,
      unitDistance: defaults.unitDistance,
      measurementType: defaults.measurementMode === 'abstract' ? 'abstract' as const : 'units' as const,
    });
  }

  return {
    schema: 'atlas-vtt',
    version: 3,
    background: backgroundPath,
    grid,
    objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} },
    camera: { x: 0, y: 0, scale: 1 },
    // The collection's resource bars, e.g. Daggerheart's Stress
    tokenSettings: withTokenBars(undefined, tokenBarsOf(settings.defaultWidgets)),
  };
}

/**
 * Writes a scene and its record as one step, so the vault check never finds the new
 * map file without a scene and adds a second asset for it.
 */
export async function createScene({ app, assetService, name, collectionId, backgroundPath, tags }: NewScene): Promise<TFile> {
  const scenePath = sceneFilePath(collectionId, name);
  const background = backgroundPath ? normalizeImagePath(backgroundPath) : null;
  const mapData = { state: newSceneState(assetService, collectionId, background), version: 3 };

  return assetService.runExclusive(async () => {
    await ensureFolder(app, scenePath.substring(0, scenePath.lastIndexOf('/')));
    const file = await app.vault.create(scenePath, JSON.stringify(mapData, null, 2));
    await assetService.addAsset({
      type: 'scene',
      name,
      collection: collectionId,
      tags: [...(tags ?? [])],
      data: { mapPath: scenePath },
    });
    return file;
  });
}
