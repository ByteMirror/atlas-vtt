import { App, Notice, TFile } from 'obsidian';
import { AssetRegistrationUncertainError } from '../../../../services/assetRegistrationRecovery';
import { withStatblockImportLock } from '../../../../services/statblockImportLock';
import { requireResolvedBestiary, statblockImportCandidate, statblockLookup } from '../../../../services/statblockImportCandidates';
import { AssetService } from '../../../../services/AssetService';
import { AssetThumbnailService } from '../../../../services/AssetThumbnailService';
import { writeAssetImage } from '../../../../services/assetImageFiles';
import { transferAssets } from '../../../../services/assetTransfer/assetTransfer';
import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import { STORED_IMAGE_SCALE } from './cropMath';
import { overwriteStoredImage, storedImageFile } from './storedTokenImage';
import { cropTokenImage } from './tokenImages';
import type { CreatorMode, EditTokenInput, TokenPreview } from './types';

export interface SaveTokenPreviewsOptions {
  app: App;
  assetService: AssetService;
  mode: CreatorMode;
  previews: TokenPreview[];
  collection: string;
  tags: string[];
  editToken?: EditTokenInput | null;
  onSaved?: (id: string) => void;
  /** Called once per preview as it is saved or fails, with the count so far and the number being saved. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  waitForOptimized: (id: string) => Promise<ProcessedImage | undefined>;
}

/** Framed tokens are cropped as shown in the preview; maps and unframed tokens use the background-converted whole image. */
async function prepareImage(file: File, preview: TokenPreview, options: SaveTokenPreviewsOptions, signal?: AbortSignal): Promise<ProcessedImage> {
  if (options.mode === 'token' && preview.showRing !== false) {
    return cropTokenImage(file, preview.imageScale, preview.imagePosition, signal);
  }
  const optimized = await options.waitForOptimized(preview.id);
  if (!optimized) throw new Error('Could not optimize the image. Try again with a smaller image.');
  return optimized;
}

/**
 * Starts converting every preview at once; the image workers bound how many
 * run together, and assets are registered in order as their images finish.
 */
function prepareImages(options: SaveTokenPreviewsOptions, signal: AbortSignal): Map<string, Promise<ProcessedImage>> {
  const prepared = new Map<string, Promise<ProcessedImage>>();
  for (const preview of options.previews) {
    if (!preview.file) continue;
    const image = prepareImage(preview.file, preview, options, signal);
    // Failures surface when the loop awaits this preview; previews it never reaches must not raise unhandled rejections.
    image.catch(() => undefined);
    prepared.set(preview.id, image);
  }
  return prepared;
}

/**
 * An edit without an upload crops the token's stored image when the crop was moved or
 * the ring was just turned on (the stored image is then the whole artwork).
 */
function cropsStoredImage(preview: TokenPreview, editToken: EditTokenInput): boolean {
  if (preview.file || preview.showRing === false) return false;
  const { imageScale, imagePosition } = preview;
  return editToken.showRing === false || imageScale !== STORED_IMAGE_SCALE || imagePosition.x !== 0 || imagePosition.y !== 0;
}

/**
 * Persists every preview as an asset. In edit mode the single preview updates
 * the existing asset and replaces its image when one was uploaded or the crop changed.
 * Returns the number of previews that were saved.
 */
export async function saveTokenPreviews(options: SaveTokenPreviewsOptions): Promise<number> {
  return options.previews.some(p => p.statblockPath)
    ? withStatblockImportLock(options.app, () => savePreviews(options))
    : savePreviews(options);
}

async function savePreviews(options: SaveTokenPreviewsOptions): Promise<number> {
  const { app, assetService, mode, previews, collection, tags, editToken } = options;
  const destinations = await assetService.getCollections();
  const destination = destinations.find(c => c.id === collection) ?? destinations.find(c => c.name === collection);
  if (!destination) throw new Error('The destination collection no longer exists. Choose another collection.');
  const meta = { collection: destination.id };
  const thumbnails = AssetThumbnailService.getInstance(app, assetService);
  if (previews.some(p => p.statblockPath)) await assetService.refreshMetadata();
  let saved = 0;

  if (editToken) {
    const preview = previews[0];
    if (!preview) return 0;
    let imagePath = editToken.imagePath ?? editToken.imageUrl;
    let thumbnailPath: string | undefined;
    const source = preview.file ?? (cropsStoredImage(preview, editToken) ? await storedImageFile(app, editToken) : null);
    if (source) {
      let prepared: ProcessedImage;
      try {
        prepared = await prepareImage(source, preview, options);
      } catch (error) {
        console.error(`[TokenCreator] Failed to optimize ${preview.name}:`, error);
        new Notice(`Failed to optimize ${preview.name}. Cannot update ${mode}.`);
        return 0;
      }
      const data = await prepared.image.arrayBuffer();
      imagePath = await overwriteStoredImage(app, editToken.imagePath, data) ?? await writeAssetImage(app, preview.name, data);
      thumbnailPath = await thumbnails.tryThumbnailForImage(imagePath, prepared.thumbnail);
    }
    const before = await assetService.getAssetById(editToken.id);
    const previousThumbnail = before?.type === 'token' || before?.type === 'map' ? before.thumbnailPath : undefined;
    await assetService.updateAsset(editToken.id, {
      name: preview.name, imagePath, showRing: preview.showRing !== false, size: preview.size, tags: preview.tags ?? tags,
      ...(source && { thumbnailPath }),
    });
    // A new image path (an upload, or stored art renamed to .webp) gets a thumbnail of its own
    if (source && previousThumbnail && previousThumbnail !== thumbnailPath) await thumbnails.tryDiscard(previousThumbnail);
    const stored = await assetService.getAssetById(editToken.id);
    if (stored && stored.collection !== destination.id) {
      await transferAssets(app, assetService, { assetIds: [editToken.id], targetCollectionId: destination.id, mode: 'move' });
    }
    return 1;
  }

  const conversion = new AbortController();
  const stopConversion = (): void => conversion.abort();
  options.signal?.addEventListener('abort', stopConversion, { once: true });
  const prepared = prepareImages(options, conversion.signal);
  let done = 0;
  options.onProgress?.(done, prepared.size);
  try {
    for (const preview of previews) {
      if (options.signal?.aborted) break;
      const pending = prepared.get(preview.id);
      if (!pending) continue;
      let imagePath: string | undefined;
      let thumbnailPath: string | undefined;
      try {
        if (preview.statblockPath) {
          const note = app.vault.getAbstractFileByPath(preview.statblockPath);
          if (!(note instanceof TFile)) throw new Error('The statblock note no longer exists.');
          const lookup = statblockLookup(await assetService.getTokenAssets(), requireResolvedBestiary());
          const candidate = await statblockImportCandidate(app, note, lookup);
          if (!candidate || candidate.status !== 'ready') throw new Error(candidate?.detail ?? 'The statblock no longer resolves.');
        }
        const { image, thumbnail } = await pending;
        if (options.signal?.aborted) break;
        imagePath = await writeAssetImage(app, preview.name, await image.arrayBuffer());
        thumbnailPath = await thumbnails.tryThumbnailForImage(imagePath, thumbnail);
        const metadata = { ...meta, tags: preview.tags ?? tags, ...(thumbnailPath && { thumbnailPath }) };
        if (mode === 'map') {
          await assetService.addAsset({ type: 'map', name: preview.name, mapFilePath: imagePath, ...metadata });
        } else {
          await assetService.addTokenAsset({
            showRing: preview.showRing !== false, name: preview.name, imagePath,
            ...(preview.size !== undefined && { size: preview.size }),
            ...(preview.statblockPath ? { statblockPath: preview.statblockPath } : {}), ...metadata,
          });
        }
        saved += 1;
        options.onSaved?.(preview.id);
      } catch (error) {
        if (error instanceof AssetRegistrationUncertainError) throw error;
        if (imagePath) {
          for (const path of mode === 'token' ? [imagePath, thumbnailPath] : [thumbnailPath]) {
            const copied = path ? app.vault.getAbstractFileByPath(path) : null;
            if (copied instanceof TFile) {
              try { await app.fileManager.trashFile(copied); } catch { /* Keep an unlinked copy if trash is unavailable. */ }
            }
          }
        }
        new Notice(`${preview.name}: ${error instanceof Error ? error.message : 'Could not save this preview.'}`);
      }
      done += 1;
      options.onProgress?.(done, prepared.size);
    }
  } finally {
    options.signal?.removeEventListener('abort', stopConversion);
    conversion.abort();
    if (saved) app.workspace.trigger('atlas-vtt:refresh-assets');
  }
  return saved;
}
