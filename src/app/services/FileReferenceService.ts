import { App } from 'obsidian';
import { AssetService, Asset } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { normalizeImagePath } from '../utils/pathUtils';
import { isSnapshotFilePath } from '../snapshots/snapshotPaths';

/**
 * Propagates file path changes (renames/moves) across all storage layers:
 * - Asset metadata (assets-metadata.json)
 * - Map files (.atlasmap token instances) and scene snapshots
 * - Statblock frontmatter (token-image field)
 * - Live UI via window event
 */
export class FileReferenceService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Called when a vault file is renamed/moved.
   * Propagates the path change to every storage layer that may reference it.
   */
  async handleFileRenamed(oldPath: string, newPath: string): Promise<void> {
    const normalizedOld = normalizeImagePath(oldPath);
    const normalizedNew = normalizeImagePath(newPath);

    if (normalizedOld === normalizedNew) return;

    await this.updateAssetMetadata(oldPath, newPath, normalizedOld, normalizedNew);
    await this.updateMapFiles(oldPath, newPath, normalizedOld, normalizedNew);
    await this.updateStatblockFrontmatter(oldPath, newPath, normalizedOld, normalizedNew);

    // Notify live renderers so the in-memory store + texture cache update
    window.dispatchEvent(new CustomEvent('atlas-asset-path-changed', {
      detail: { oldPath, newPath },
    }));
  }

  // ---------------------------------------------------------------------------
  // Asset metadata
  // ---------------------------------------------------------------------------

  private async updateAssetMetadata(
    oldPath: string, newPath: string,
    normalizedOld: string, normalizedNew: string,
  ): Promise<boolean> {
    const assetService = AssetService.getInstance(this.app);
    await assetService.initialize();

    return assetService.rewriteAssets((asset: Asset): boolean => {
      let changed = false;
      switch (asset.type) {
        case 'token': {
          if (this.pathMatches(asset.imagePath, oldPath, normalizedOld)) {
            asset.imagePath = newPath;
            changed = true;
          }
          if (asset.statblockPath && this.pathMatches(asset.statblockPath, oldPath, normalizedOld)) {
            asset.statblockPath = newPath;
            changed = true;
          }
          break;
        }
        case 'encounter':
        case 'player': {
          if (asset.tokens) {
            for (const tok of asset.tokens) {
              if (tok.imagePath && this.pathMatches(tok.imagePath, oldPath, normalizedOld)) {
                tok.imagePath = newPath;
                changed = true;
              }
              if (tok.statblockPath && this.pathMatches(tok.statblockPath, oldPath, normalizedOld)) {
                tok.statblockPath = newPath;
                changed = true;
              }
            }
          }
          break;
        }
        case 'map': {
          if (this.pathMatches(asset.mapFilePath, oldPath, normalizedOld)) {
            asset.mapFilePath = newPath;
            changed = true;
          }
          break;
        }
        case 'note': {
          if (this.pathMatches(asset.notePath, oldPath, normalizedOld)) {
            asset.notePath = newPath;
            changed = true;
          }
          break;
        }
      }
      return changed;
    });
  }

  // ---------------------------------------------------------------------------
  // .atlasmap files
  // ---------------------------------------------------------------------------

  private async updateMapFiles(
    oldPath: string, newPath: string,
    normalizedOld: string, _normalizedNew: string,
  ): Promise<boolean> {
    // Scene snapshots hold the same map state, so they follow renamed files too.
    const mapFiles = this.app.vault.getFiles().filter(f => f.extension === 'atlasmap' || isSnapshotFilePath(f.path));
    let anyChanged = false;

    /** Returns the rewritten map JSON, or null when the map does not reference the old path. */
    const rewriteMap = (content: string): string | null => {
      const mapData: unknown = JSON.parse(content);
      if (!isPersistedMapEnvelope(mapData)) return null;

      const tokens = mapData.state?.objects?.tokens;
      if (!tokens) return null;

      let modified = false;

      for (const token of Object.values(tokens)) {
        if (token.imagePath && this.pathMatches(token.imagePath, oldPath, normalizedOld)) {
          token.imagePath = newPath;
          modified = true;
        }
        // Checked by presence, not `kind`: linking writes statblockPath onto plain tokens too.
        if ('statblockPath' in token && token.statblockPath && this.pathMatches(token.statblockPath, oldPath, normalizedOld)) {
          token.statblockPath = newPath;
          modified = true;
        }
      }

      return modified ? JSON.stringify(mapData, null, 2) : null;
    };

    for (const mapFile of mapFiles) {
      try {
        if (rewriteMap(await this.app.vault.read(mapFile)) === null) continue;
        await this.app.vault.process(mapFile, (latest) => rewriteMap(latest) ?? latest);
        anyChanged = true;
      } catch (error) {
        console.error(`[FileReferenceService] Error updating map ${mapFile.path}:`, error);
      }
    }

    return anyChanged;
  }

  // ---------------------------------------------------------------------------
  // Statblock frontmatter (token-image field)
  // ---------------------------------------------------------------------------

  private async updateStatblockFrontmatter(
    oldPath: string, newPath: string,
    normalizedOld: string, _normalizedNew: string,
  ): Promise<void> {
    // Find statblock .md files whose frontmatter token-image matches the old path
    const mdFiles = this.app.vault.getFiles().filter(f => f.extension === 'md');

    for (const mdFile of mdFiles) {
      try {
        const cache = this.app.metadataCache.getFileCache(mdFile);
        if (!cache?.frontmatter) continue;

        const tokenImage: unknown = cache.frontmatter['token-image'];
        if (typeof tokenImage !== 'string' || !tokenImage) continue;

        if (!this.pathMatches(tokenImage, oldPath, normalizedOld)) continue;

        await this.app.fileManager.processFrontMatter(mdFile, (frontmatter: Record<string, unknown>) => {
          frontmatter['token-image'] = newPath;
        });
      } catch (error) {
        console.error(`[FileReferenceService] Error updating frontmatter in ${mdFile.path}:`, error);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Compare paths accounting for both raw and normalized forms. */
  private pathMatches(candidate: string | undefined, rawOld: string, normalizedOld: string): boolean {
    if (!candidate) return false;
    return candidate === rawOld || normalizeImagePath(candidate) === normalizedOld;
  }
}
