import { App, Notice, TFile } from 'obsidian';
import { AssetRegistrationUncertainError } from '../../../../services/assetRegistrationRecovery';
import { withStatblockImportLock } from '../../../../services/statblockImportLock';
import { requireResolvedBestiary, statblockImportCandidate } from '../../../../services/statblockImportCandidates';
import { AssetService } from '../../../../services/AssetService';
import { TokenThumbnailService } from '../../../../services/TokenThumbnailService';
import { optimizeImage, OPTIMIZATION_PRESETS } from '../../../../utils/imageOptimizer';
import { bakeTokenCrop } from './bakeTokenCrop';
import type { CreatorMode, EditTokenInput, TokenPreview } from './types';

const ASSETS_DIR = 'atlas-vtt/assets';

export interface SaveTokenPreviewsOptions {
  app: App;
  assetService: AssetService;
  mode: CreatorMode;
  previews: TokenPreview[];
  collection: string;
  tags: string[];
  editToken?: EditTokenInput | null;
  onSaved?: (id: string) => void;
  signal?: AbortSignal;
  waitForOptimized: (id: string) => Promise<Blob | undefined>;
}

async function ensureAssetsDir(app: App): Promise<void> {
  if (!app.vault.getAbstractFileByPath(ASSETS_DIR)) {
    await app.vault.createFolder(ASSETS_DIR);
  }
}

async function writeImage(app: App, name: string, blob: Blob): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `${ASSETS_DIR}/${safeName}_${suffix}.webp`;
  await app.vault.createBinary(path, await blob.arrayBuffer());
  return path;
}

/** Tokens are cropped as shown in the preview and re-optimized; maps use the background-optimized whole image. */
async function resolveImageBlob(preview: TokenPreview, mode: CreatorMode, waitForOptimized: (id: string) => Promise<Blob | undefined>): Promise<Blob | undefined> {
  if (mode === 'token' && preview.file && preview.showRing !== false) {
    const cropped = await bakeTokenCrop(preview.file, preview.imageScale, preview.imagePosition);
    return (await optimizeImage(cropped, OPTIMIZATION_PRESETS.token)).blob;
  }
  return waitForOptimized(preview.id);
}

/**
 * Persists every preview as an asset. In edit mode the single preview updates
 * the existing asset and only writes a new image when one was uploaded.
 * Returns the number of previews that were saved.
 */
export async function saveTokenPreviews(options: SaveTokenPreviewsOptions): Promise<number> {
  return options.previews.some(p => p.statblockPath)
    ? withStatblockImportLock(options.app, () => savePreviews(options))
    : savePreviews(options);
}

async function savePreviews(options: SaveTokenPreviewsOptions): Promise<number> {
  const { app, assetService, mode, previews, collection, tags, editToken, waitForOptimized } = options;
  const destinations = await assetService.getCollections();
  const destination = destinations.find(c => c.id === collection) ?? destinations.find(c => c.name === collection);
  if (!destination) throw new Error('The destination collection no longer exists. Choose another collection.');
  const meta = { collection: destination.id };
  const thumbnails = TokenThumbnailService.getInstance(app, assetService);
  if (previews.some(p => p.statblockPath)) await assetService.refreshMetadata();
  await ensureAssetsDir(app);
  let saved = 0;

  if (editToken) {
    const preview = previews[0];
    if (!preview) return 0;
    let imagePath = editToken.imagePath ?? editToken.imageUrl;
    let thumbnailPath: string | undefined;
    if (preview.file) {
      const blob = await resolveImageBlob(preview, mode, waitForOptimized);
      if (!blob) {
        new Notice(`Failed to optimize ${preview.name}. Cannot update ${mode}.`);
        return 0;
      }
      imagePath = await writeImage(app, preview.name, blob);
      thumbnailPath = await thumbnails.tryCreateForImage(imagePath);
    }
    await assetService.updateAsset(editToken.id, {
      name: preview.name, imagePath, showRing: preview.showRing !== false, tags: preview.tags ?? tags,
      ...meta, ...(preview.file && { thumbnailPath }),
    });
    return 1;
  }

  try {
    for (const preview of previews) {
      if (options.signal?.aborted) break;
      if (!preview.file) continue;
      let imagePath: string | undefined;
      let thumbnailPath: string | undefined;
      try {
        if (preview.statblockPath) {
          const note = app.vault.getAbstractFileByPath(preview.statblockPath);
          if (!(note instanceof TFile)) throw new Error('The statblock note no longer exists.');
          const candidate = await statblockImportCandidate(app, note, await assetService.getTokenAssets(), requireResolvedBestiary());
          if (!candidate || candidate.status !== 'ready') throw new Error(candidate?.detail ?? 'The statblock no longer resolves.');
        }
        const blob = await resolveImageBlob(preview, mode, waitForOptimized);
        if (!blob) throw new Error('Could not optimize the image. Try again with a smaller image.');
        if (options.signal?.aborted) break;
        imagePath = await writeImage(app, preview.name, blob);
        const metadata = { ...meta, tags: preview.tags ?? tags };
        if (mode === 'map') {
          await assetService.addAsset({ type: 'map', name: preview.name, mapFilePath: imagePath, ...metadata });
        } else {
          thumbnailPath = await thumbnails.tryCreateForImage(imagePath);
          await assetService.addTokenAsset({
            showRing: preview.showRing !== false, name: preview.name, imagePath, ...(thumbnailPath && { thumbnailPath }),
            ...(preview.statblockPath ? { statblockPath: preview.statblockPath } : {}), ...metadata,
          });
        }
        saved += 1;
        options.onSaved?.(preview.id);
      } catch (error) {
        if (error instanceof AssetRegistrationUncertainError) throw error;
        if (imagePath && mode === 'token') {
          for (const path of [imagePath, thumbnailPath]) {
            const copied = path ? app.vault.getAbstractFileByPath(path) : null;
            if (copied instanceof TFile) {
              try { await app.fileManager.trashFile(copied); } catch { /* Keep an unlinked copy if trash is unavailable. */ }
            }
          }
        }
        new Notice(`${preview.name}: ${error instanceof Error ? error.message : 'Could not save this preview.'}`);
      }
    }
  } finally {
    if (saved) app.workspace.trigger('atlas-vtt:refresh-assets');
  }
  return saved;
}
