import { App, Notice } from 'obsidian';
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
  const { app, assetService, mode, previews, collection, tags, editToken, waitForOptimized } = options;
  const meta = { tags, collection: collection.toLowerCase() };
  const thumbnails = TokenThumbnailService.getInstance(app, assetService);
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
    // A new image invalidates the old thumbnail even when the new one could not be rendered.
    await assetService.updateAsset(editToken.id, {
      name: preview.name, imagePath, showRing: preview.showRing !== false, ...meta, ...(preview.file && { thumbnailPath }),
    });
    return 1;
  }

  for (const preview of previews) {
    if (!preview.file) continue;
    const blob = await resolveImageBlob(preview, mode, waitForOptimized);
    if (!blob) {
      new Notice(`Failed to optimize ${preview.name}. Try again with a smaller image.`);
      continue;
    }
    const imagePath = await writeImage(app, preview.name, blob);
    if (mode === 'map') {
      await assetService.addAsset({
        type: 'map',
        name: preview.name,
        mapFilePath: imagePath,
        ...meta,
      });
    } else {
      const thumbnailPath = await thumbnails.tryCreateForImage(imagePath);
      await assetService.addTokenAsset({
        showRing: preview.showRing !== false, name: preview.name, imagePath, ...meta, ...(thumbnailPath && { thumbnailPath }),
      });
    }
    saved += 1;
  }
  return saved;
}
