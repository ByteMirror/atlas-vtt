import { TFile, type App } from 'obsidian';
import { AssetService, type TokenAsset } from './AssetService';
import { ensureFolder } from '../plugin/vaultFolders';
import { renderThumbnail } from '../utils/imageThumbnail';

export const TOKEN_THUMBNAIL_DIR = 'atlas-vtt/assets/thumbnails';
/** Longer side of a thumbnail; asset cards are about half this size on a 2x display. */
export const TOKEN_THUMBNAIL_SIZE = 256;
const MAX_CONCURRENT = 2;
const FLUSH_DELAY_MS = 300;

export type ThumbnailRenderer = (source: Blob, size: number) => Promise<ArrayBuffer>;
export interface ThumbnailUpdate {
  id: string;
  thumbnailPath: string;
}
type ThumbnailListener = (updates: ThumbnailUpdate[]) => void;

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
 * Small previews of token images so lists never decode full-size art.
 * Thumbnails are written next to the assets and recorded on the token; tokens
 * that lack one (older assets, imported collections) get theirs generated in
 * the background, a few at a time, and persisted in batches.
 */
export class TokenThumbnailService {
  private static readonly instances = new WeakMap<App, TokenThumbnailService>();
  private readonly listeners = new Set<ThumbnailListener>();
  private readonly queued = new Set<string>();
  private readonly failedImages = new Set<string>();
  private readonly pendingUpdates = new Map<string, string>();
  private readonly queue: TokenAsset[] = [];
  private running = 0;
  private flushTimer: number | null = null;

  static getInstance(app: App, assets: AssetService): TokenThumbnailService {
    let instance = TokenThumbnailService.instances.get(app);
    if (!instance) {
      instance = new TokenThumbnailService(app, assets);
      TokenThumbnailService.instances.set(app, instance);
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
    return `${TOKEN_THUMBNAIL_DIR}/${safeName}-${pathDigest(imagePath)}.webp`;
  }

  hasThumbnail(asset: TokenAsset): boolean {
    return asset.thumbnailPath !== undefined
      && this.app.vault.getAbstractFileByPath(asset.thumbnailPath) instanceof TFile;
  }

  /** Renders and writes the thumbnail of the image at `imagePath`, returning the thumbnail's path. */
  async createForImage(imagePath: string): Promise<string> {
    const image = this.app.vault.getAbstractFileByPath(imagePath);
    if (!(image instanceof TFile)) throw new Error(`Token image not found: ${imagePath}`);
    const source = new Blob([await this.app.vault.readBinary(image)]);
    const thumbnail = await this.render(source, TOKEN_THUMBNAIL_SIZE);
    const thumbnailPath = this.thumbnailPathFor(imagePath);
    await this.writeThumbnail(thumbnailPath, thumbnail);
    return thumbnailPath;
  }

  /** Like `createForImage`, but a failure is logged and leaves the token for the background pass. */
  async tryCreateForImage(imagePath: string): Promise<string | undefined> {
    try {
      return await this.createForImage(imagePath);
    } catch (error) {
      console.error('[TokenThumbnailService] Could not create thumbnail for', imagePath, error);
      return undefined;
    }
  }

  /** Receives every batch of thumbnails recorded on assets; returns the unsubscribe function. */
  onUpdated(listener: ThumbnailListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Queues thumbnails for every token in `tokens` that has none; already queued or failed images are skipped. */
  ensureThumbnails(tokens: readonly TokenAsset[]): void {
    for (const token of tokens) {
      if (this.hasThumbnail(token) || this.queued.has(token.id) || this.failedImages.has(token.imagePath)) continue;
      this.queued.add(token.id);
      this.queue.push(token);
    }
    this.pump();
  }

  private pump(): void {
    while (this.running < MAX_CONCURRENT && this.queue.length > 0) {
      const token = this.queue.shift()!;
      this.running += 1;
      void this.generate(token).finally(() => {
        this.running -= 1;
        this.queued.delete(token.id);
        this.pump();
      });
    }
    if (this.running === 0 && this.queue.length === 0 && this.pendingUpdates.size > 0) {
      this.scheduleFlush(0);
    }
  }

  private async generate(token: TokenAsset): Promise<void> {
    const thumbnailPath = await this.tryCreateForImage(token.imagePath);
    if (!thumbnailPath) {
      this.failedImages.add(token.imagePath);
      return;
    }
    this.pendingUpdates.set(token.id, thumbnailPath);
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
        if (asset.type !== 'token' || !thumbnailPath) return false;
        asset.thumbnailPath = thumbnailPath;
        return true;
      });
    } catch (error) {
      console.error('[TokenThumbnailService] Could not record thumbnails:', error);
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
    await ensureFolder(this.app, TOKEN_THUMBNAIL_DIR);
    await this.app.vault.createBinary(path, content);
  }
}
