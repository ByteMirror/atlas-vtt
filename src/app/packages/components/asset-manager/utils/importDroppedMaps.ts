import { App, Notice, TFile } from 'obsidian';
import { AssetService } from '../../../../services/AssetService';
import { createScene, sceneFilePath } from '../../../../services/sceneCreation';
import { writeAssetFile, writeAssetImage } from '../../../../services/assetImageFiles';
import { MapThumbnailService } from '../../../../services/MapThumbnailService';
import { mapFileThumbnail } from './mapFileThumbnail';
import { optimizeUpload } from '../token-creator/tokenImages';

/** Map art the image pipeline converts, as everywhere else in Atlas. */
const MAP_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];
/** Animated maps. Kept byte for byte: the image workers decode stills only. */
const MAP_VIDEO_EXTENSIONS = ['webm', 'mp4', 'm4v', 'mov', 'ogv'];

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Whether a drop holds files Atlas can make a scene from. */
export function hasDroppableFiles(transfer: DataTransfer): boolean {
  return Array.from(transfer.types).includes('Files');
}

/** A scene name that is free in `collectionId`, by numbering duplicates as Obsidian does. */
function availableSceneName(app: App, collectionId: string, baseName: string): string {
  if (!(app.vault.getAbstractFileByPath(sceneFilePath(collectionId, baseName)) instanceof TFile)) return baseName;
  for (let index = 1; ; index++) {
    const candidate = `${baseName} ${index}`;
    if (!(app.vault.getAbstractFileByPath(sceneFilePath(collectionId, candidate)) instanceof TFile)) return candidate;
  }
}

/** Stores the map itself and answers with its vault path. */
async function writeBackground(app: App, file: File, name: string, extension: string): Promise<string> {
  if (MAP_VIDEO_EXTENSIONS.includes(extension)) {
    return writeAssetFile(app, name, extension, await file.arrayBuffer());
  }
  const { image } = await optimizeUpload(file, 'map', { thumbnail: false });
  return writeAssetImage(app, name, await image.arrayBuffer());
}

/** Gives the new scene the card image it would otherwise only get by being opened. */
async function saveDroppedMapThumbnail(thumbnails: MapThumbnailService, scene: TFile, file: File, isVideo: boolean): Promise<void> {
  try {
    const still = await mapFileThumbnail(file, isVideo);
    if (still) await thumbnails.saveThumbnail(scene.path, still);
  } catch (error) {
    console.error('[Atlas] Could not save a thumbnail for the dropped map', file.name, error);
  }
}

export interface DroppedMapImport {
  app: App;
  assetService: AssetService;
  collectionId: string;
  files: FileList;
}

/**
 * Makes a scene of every map dropped onto the asset manager from outside Obsidian.
 * The scene's grid is measured from the map when it first opens; its card shows a
 * still taken from the dropped file, since a scene that has never been opened has
 * nothing to render a thumbnail from.
 *
 * Returns how many scenes were created.
 */
export async function importDroppedMaps({ app, assetService, collectionId, files }: DroppedMapImport): Promise<number> {
  const thumbnails = new MapThumbnailService(app);
  let created = 0;

  for (const file of Array.from(files)) {
    const extension = extensionOf(file.name);
    if (!MAP_IMAGE_EXTENSIONS.includes(extension) && !MAP_VIDEO_EXTENSIONS.includes(extension)) {
      new Notice(`${file.name} is not an image or video Atlas can use as a map.`);
      continue;
    }

    const baseName = file.name.slice(0, file.name.length - extension.length - 1) || file.name;
    let backgroundPath: string | null = null;
    let scene: TFile | null = null;
    try {
      backgroundPath = await writeBackground(app, file, baseName, extension);
      scene = await createScene({
        app,
        assetService,
        name: availableSceneName(app, collectionId, baseName),
        collectionId,
        backgroundPath,
      });
      created += 1;
    } catch (error) {
      console.error('[Atlas] Could not import the dropped map', file.name, error);
      new Notice(`Could not import ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      // The map would otherwise stay in the assets folder with no scene using it
      const written = backgroundPath ? app.vault.getAbstractFileByPath(backgroundPath) : null;
      if (written instanceof TFile) {
        try { await app.fileManager.trashFile(written); } catch { /* Keep the copy if trash is unavailable. */ }
      }
    }

    // Deliberately after the import and outside its catch: saveThumbnail needs the scene
    // on disk, and a card with no image is worth far less than the map it would undo.
    if (scene) await saveDroppedMapThumbnail(thumbnails, scene, file, MAP_VIDEO_EXTENSIONS.includes(extension));
  }

  if (created > 0) new Notice(created === 1 ? 'Imported 1 map as a scene.' : `Imported ${created} maps as scenes.`);
  return created;
}
