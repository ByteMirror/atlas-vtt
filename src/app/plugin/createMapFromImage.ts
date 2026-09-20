import { App, Notice, TFile } from 'obsidian';
import { optimizeImage, OPTIMIZATION_PRESETS, formatFileSize } from '../utils/imageOptimizer';
import { ensureFolder } from './vaultFolders';
import { EXTENSION_ATLASMAP, openMapInView } from './atlasLeaves';

const VAULT_ATLAS_DIR = 'atlas-vtt';
const VAULT_ASSETS_DIR = `${VAULT_ATLAS_DIR}/assets`;
const VAULT_COLLECTIONS_DIR = `${VAULT_ATLAS_DIR}/collections`;
const DEFAULT_COLLECTION_DIR = `${VAULT_COLLECTIONS_DIR}/default`;
const DEFAULT_MAPS_DIR = `${DEFAULT_COLLECTION_DIR}/maps`;

/** Persisted map schema version written for new maps; MapPersistence migrates it forward on load. */
const NEW_MAP_VERSION = 3;

interface PreparedImage {
  blob: Blob;
  fileName: string;
  /** Human-readable size savings, empty when the original is used as is. */
  summary: string;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

async function prepareMapImage(file: File): Promise<PreparedImage> {
  try {
    const result = await optimizeImage(file, OPTIMIZATION_PRESETS.map);
    const originalSize = formatFileSize(result.originalSize);
    const optimizedSize = formatFileSize(result.optimizedSize);
    return {
      blob: result.blob,
      fileName: `${stripExtension(file.name)}.webp`,
      summary: ` (optimized from ${originalSize} to ${optimizedSize}, ${result.compressionRatio}% savings)`,
    };
  } catch (error) {
    console.warn('[Atlas] Image optimization failed, using the original file:', error);
    return { blob: file, fileName: file.name, summary: '' };
  }
}

async function writeBinaryFile(app: App, path: string, data: ArrayBuffer): Promise<void> {
  const existing = app.vault.getFileByPath(path);
  if (existing) {
    await app.vault.modifyBinary(existing, data);
  } else {
    await app.vault.createBinary(path, data);
  }
}

async function writeTextFile(app: App, path: string, content: string): Promise<TFile> {
  const existing = app.vault.getFileByPath(path);
  if (existing) {
    await app.vault.process(existing, () => content);
    return existing;
  }
  return app.vault.create(path, content);
}

function buildMapFileContent(name: string, backgroundPath: string): string {
  const state = {
    schema: 'atlas-vtt',
    version: NEW_MAP_VERSION,
    name,
    background: backgroundPath,
    grid: { enabled: true, size: 70, offsetX: 0, offsetY: 0, color: '#00FFFF', opacity: 0.5 },
    objects: { tokens: {}, fog: {}, pins: {} },
    camera: { x: 0, y: 0, scale: 1 },
  };
  // Zustand persist envelope, which is what the view store reads.
  return JSON.stringify({ state, version: NEW_MAP_VERSION }, null, 2);
}

async function createMapFromImageFile(app: App, file: File): Promise<void> {
  const progressNotice = new Notice('Optimizing map image…', 0);
  try {
    for (const dir of [VAULT_ATLAS_DIR, VAULT_ASSETS_DIR, VAULT_COLLECTIONS_DIR, DEFAULT_COLLECTION_DIR, DEFAULT_MAPS_DIR]) {
      await ensureFolder(app, dir);
    }

    const image = await prepareMapImage(file);
    const imagePath = `${VAULT_ASSETS_DIR}/${image.fileName}`;
    await writeBinaryFile(app, imagePath, await image.blob.arrayBuffer());
    progressNotice.hide();

    const mapName = stripExtension(file.name);
    const mapFile = await writeTextFile(
      app,
      `${DEFAULT_MAPS_DIR}/${mapName}.${EXTENSION_ATLASMAP}`,
      buildMapFileContent(mapName, imagePath)
    );

    await openMapInView(app, mapFile);
    new Notice(`Created map: ${mapFile.name}${image.summary}`);
  } catch (error: unknown) {
    progressNotice.hide();
    console.error('[Atlas] Error creating map:', error);
    new Notice(`Error creating map: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Lets the user pick an image from disk and turns it into a new map in the default collection. */
export function promptNewMapFromImage(app: App): void {
  const input = document.body.createEl('input', {
    type: 'file',
    cls: 'atlas-hidden-file-input',
    attr: { accept: 'image/*' },
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) void createMapFromImageFile(app, file);
  });
  input.addEventListener('cancel', () => input.remove());

  input.click();
}
