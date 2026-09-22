import { withStatblockImportLock } from './statblockImportLock';
import { TFile, normalizePath, type App } from 'obsidian';
import { AssetService, type TokenAsset } from './AssetService';
import { TokenThumbnailService } from './TokenThumbnailService';
import { AssetRegistrationUncertainError } from './assetRegistrationRecovery';
import { requireResolvedBestiary, statblockImportCandidate, type StatblockImportCandidate } from './statblockImportCandidates';

export interface StatblockImportItem {
  path: string;
  name: string;
  status: 'created' | 'skipped' | 'failed';
  message: string;
  asset?: TokenAsset;
  uncertain?: boolean;
}
export interface StatblockImportResult {
  items: StatblockImportItem[];
  cancelled: boolean;
  uncertain: boolean;
}
export interface StatblockImportOptions {
  signal?: AbortSignal;
  ringByPath?: Readonly<Record<string, boolean>>;
  onProgress?: (completed: number, total: number) => void;
}

/** A user-triggered local import. No network requests or changes to source notes. */
export class StatblockTokenImportService {
  constructor(private readonly app: App, private readonly assets = AssetService.getInstance(app)) {}

  async scan(signal?: AbortSignal): Promise<StatblockImportCandidate[]> {
    const bestiary = requireResolvedBestiary();
    const assets = await this.assets.getTokenAssets();
    const candidates: StatblockImportCandidate[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (signal?.aborted) break;
      try {
        const row = await statblockImportCandidate(this.app, file, assets, bestiary);
        if (row) candidates.push(row);
      } catch {
        // Only report recognized notes; unrelated unreadable files are not import candidates.
        if (bestiary.some(creature => creature.path === file.path)) {
          candidates.push({ path: file.path, name: file.basename, status: 'conflict', detail: 'Could not read this statblock. Try scanning again.' });
        }
      }
    }
    return candidates.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  }

  async import(paths: readonly string[], collection: string, options: StatblockImportOptions = {}): Promise<StatblockImportResult> {
    return withStatblockImportLock(this.app, () => this.importPaths(paths, collection, options));
  }

  private async importPaths(paths: readonly string[], collection: string, options: StatblockImportOptions): Promise<StatblockImportResult> {
    const result: StatblockImportResult = { items: [], cancelled: false, uncertain: false };
    try {
      requireResolvedBestiary();
      if (!(await this.assets.getCollections()).some(c => c.id === collection)) throw new Error('The destination collection no longer exists. Choose another collection.');
      const uniquePaths = [...new Set(paths.map(path => normalizePath(path)))];
      for (const path of uniquePaths) {
        if (options.signal?.aborted) break;
        const item = await this.importNote(path, collection, options.ringByPath?.[path] ?? false);
        result.items.push(item);
        options.onProgress?.(result.items.length, uniquePaths.length);
        if (item.uncertain) { result.uncertain = true; break; }
      }
      result.cancelled = Boolean(options.signal?.aborted);
      return result;
    } finally {
      if (result.items.some(item => item.status === 'created')) this.app.workspace.trigger('atlas-vtt:refresh-assets');
    }
  }

  private async importNote(path: string, collection: string, showRing: boolean): Promise<StatblockImportItem> {
    let name = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
    let copied: TFile | undefined;
    let thumbnailPath: string | undefined;
    try {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return { path, name, status: 'skipped', message: 'The statblock note no longer exists.' };
      const row = await statblockImportCandidate(this.app, file, await this.assets.getTokenAssets(), requireResolvedBestiary());
      if (!row || row.status !== 'ready' || !row.imagePath) return { path, name: row?.name ?? name, status: 'skipped', message: row?.detail ?? 'No recognized statblock in this note.' };
      name = row.name;
      const image = this.app.vault.getAbstractFileByPath(row.imagePath);
      if (!(image instanceof TFile)) return { path, name, status: 'skipped', message: 'The source image no longer exists.' };
      const dir = 'atlas-vtt/assets';
      if (!this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'creature';
      const imagePath = `${dir}/${safeName}_${crypto.randomUUID()}.${image.extension}`;
      copied = await this.app.vault.createBinary(imagePath, await this.app.vault.readBinary(image));
      thumbnailPath = await TokenThumbnailService.getInstance(this.app, this.assets).tryCreateForImage(imagePath);
      const asset = await this.assets.addTokenAsset({
        name, imagePath, statblockPath: path, showRing, tags: [], collection, ...(thumbnailPath && { thumbnailPath }),
      });
      return { path, name, status: 'created', message: 'Token created.', asset };
    } catch (error) {
      // An unconfirmed write may have committed. Never delete the image in this case.
      if (error instanceof AssetRegistrationUncertainError) return { path, name, status: 'failed', message: error.message, uncertain: true };
      for (const orphan of [copied, thumbnailPath && this.app.vault.getAbstractFileByPath(thumbnailPath)]) {
        if (!(orphan instanceof TFile)) continue;
        try { await this.app.fileManager.trashFile(orphan); } catch { /* Leave a safe, unlinked image if trash is unavailable. */ }
      }
      return { path, name, status: 'failed', message: error instanceof Error ? error.message : 'Could not create this token.' };
    }
  }
}
