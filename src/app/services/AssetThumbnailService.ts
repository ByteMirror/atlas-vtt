import { TFile, type App } from 'obsidian';
import { AssetService, type MapAsset, type TokenAsset } from './AssetService';
import { ensureFolder } from '../plugin/vaultFolders';
import { renderThumbnail } from '../utils/imageThumbnail';

export const THUMBNAIL_DIR = 'atlas-vtt/assets/thumbnails';
/** Longer side of a thumbnail; asset cards are about half this size on a 2x display. */
export const THUMBNAIL_SIZE = 256;
const MAX_CONCURRENT = 2;
const FLUSH_DELAY_MS = 300;

export type ThumbnailRenderer = (source: Blob, size: number) => Promise<ArrayBuffer>;
export interface ThumbnailUpdate {
  id: string;
  thumbnailPath: string;
}
type ThumbnailListener = (updates: ThumbnailUpdate[]) => void;
/** Assets whose cards show an image: token art or a map image. */
export type ThumbnailAsset = TokenAsset | MapAsset;

function sourceImagePath(asset: ThumbnailAsset): string {
  return asset.type === 'token' ? asset.imagePath : asset.mapFilePath;
}

/** Short stable digest so thumbnails of same-named images in different folders do not collide. */
function pathDigest(path: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Small previews of token and map images so lists never decode full-size art
 * (a single map card would otherwise hold a decoded 5000 px image in memory).
 * Thumbnails are written next to the assets and recorded on the asset; assets
 * that lack one (older assets, imported collections) get theirs generated in
 * the background, a few at a time, and persisted in batches.
 */
export class AssetThumbnailService {
  private static readonly instances = new WeakMap<App, AssetThumbnailService>();
  private readonly listeners = new Set<ThumbnailListener>();
  private readonly queued = new Set<string>();
  private readonly failedImages = new Set<string>();
  private readonly pendingUpdates = new Map<string, string>();
  private readonly queue: ThumbnailAsset[] = [];
  private running = 0;
  private flushTimer: number | null = null;

  static getInstance(app: App, assets: AssetService): AssetThumbnailService {
    let instance = AssetThumbnailService.instances.get(app);
    if (!instance) {
      instance = new AssetThumbnailService(app, assets);
      AssetThumbnailService.instances.set(app, instance);
    }
    return instance;
  }

  constructor(
    private readonly app: App,
    private readonly assets: AssetService,
    private readonly render: ThumbnailRenderer = renderThumbnail,
  ) {}

  /** Vault path of the thumbnail that belongs to `imagePath`, whether or not it exists yet. */
  thumbnailPathFor(imagePath: string): string {
    const fileName = imagePath.slice(imagePath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'token';
    return `${THUMBNAIL_DIR}/${safeName}-${pathDigest(imagePath)}.webp`;
  }

  hasThumbnail(asset: ThumbnailAsset): boolean {
    return asset.thumbnailPath !== undefined
      && this.app.vault.getAbstractFileByPath(asset.thumbnailPath) instanceof TFile;
  }

  /** Renders and writes the thumbnail of the image at `imagePath`, returning the thumbnail's path. */
  async createForImage(imagePath: string): Promise<string> {
    const image = this.app.vault.getAbstractFileByPath(imagePath);
    if (!(image instanceof TFile)) throw new Error(`Image not found: ${imagePath}`);
    const source = new Blob([await this.app.vault.readBinary(image)]);
    const thumbnail = await this.render(source, THUMBNAIL_SIZE);
    const thumbnailPath = this.thumbnailPathFor(imagePath);
    await this.writeThumbnail(thumbnailPath, thumbnail);
    return thumbnailPath;
  }

  /** Like `createForImage`, but a failure is logged and leaves the asset for the background pass. */
  async tryCreateForImage(imagePath: string): Promise<string | undefined> {
    try {
      return await this.createForImage(imagePath);
    } catch (error) {
      console.error('[AssetThumbnailService] Could not create thumbnail for', imagePath, error);
      return undefined;
    }
  }

  /** Receives every batch of thumbnails recorded on assets; returns the unsubscribe function. */
  onUpdated(listener: ThumbnailListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Queues thumbnails for every asset in `assets` that has none; already queued or failed images are skipped. */
  ensureThumbnails(assets: readonly ThumbnailAsset[]): void {
    for (const asset of assets) {
      if (this.hasThumbnail(asset) || this.queued.has(asset.id) || this.failedImages.has(sourceImagePath(asset))) continue;
      this.queued.add(asset.id);
      this.queue.push(asset);
    }
    this.pump();
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENT && this.queue.length > 0) {
      const asset = this.queue.shift()!;
      this.running += 1;
      void this.generate(asset).finally(() => {
        this.running -= 1;
        this.queued.delete(asset.id);
        this.pump();
      });
    }
    if (this.running === 0 && this.queue.length === 0 && this.pendingUpdates.size > 0) {
      this.scheduleFlush(0);
    }
  }

  private async generate(asset: ThumbnailAsset): Promise<void> {
    const imagePath = sourceImagePath(asset);
    const thumbnailPath = await this.tryCreateForImage(imagePath);
    if (!thumbnailPath) {
      this.failedImages.add(imagePath);
      return;
    }
    this.pendingUpdates.set(asset.id, thumbnailPath);
    this.scheduleFlush(FLUSH_DELAY_MS);
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer !== null) window.clearTimeout(this.flushTimer);
    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, delay);
  }

  /** Records the generated thumbnails on their assets with a single metadata save. */
  private async flush(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;
    const byId = new Map(this.pendingUpdates);
    this.pendingUpdates.clear();
    try {
      await this.assets.rewriteAssets((asset) => {
        const thumbnailPath = byId.get(asset.id);
        if ((asset.type !== 'token' && asset.type !== 'map') || !thumbnailPath) return false;
        asset.thumbnailPath = thumbnailPath;
        return true;
      });
    } catch (error) {
      console.error('[AssetThumbnailService] Could not record thumbnails:', error);
      return;
    }
    const updates = Array.from(byId, ([id, thumbnailPath]) => ({ id, thumbnailPath }));
    for (const listener of this.listeners) listener(updates);
  }

  private async writeThumbnail(path: string, content: ArrayBuffer): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, content);
      return;
    }
    await ensureFolder(this.app, THUMBNAIL_DIR);
    await this.app.vault.createBinary(path, content);
  }
}
