import { App, TFile } from 'obsidian';
import { AssetService, Asset } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { normalizeImagePath } from '../utils/pathUtils';
import { mapThumbnailPath } from '../utils/dataFileMigration';
import { pathMatches, rewriteMapReferences } from './renamedPaths';
import { SceneSnapshotService } from '../snapshots/SceneSnapshotService';

/**
 * Propagates file path changes (renames/moves) across all storage layers:
 * - Asset metadata (assets-metadata.json), including scene records of a renamed map
 * - Map files (.atlasmap token instances and pin targets) and scene snapshots
 * - Statblock frontmatter (token-image field)
 * - The thumbnail of a renamed map
 *
 * The open map is updated separately by its view, from the same vault event.
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

    await this.updateAssetMetadata(oldPath, newPath);
    await this.updateScenes(oldPath, newPath);
    await this.renameMapThumbnail(oldPath, newPath);
    await this.updateMapFiles(oldPath, newPath);
    await this.updateStatblockFrontmatter(oldPath, newPath);
  }

  // ---------------------------------------------------------------------------
  // Asset metadata
  // ---------------------------------------------------------------------------

  private async updateAssetMetadata(oldPath: string, newPath: string): Promise<boolean> {
    const assetService = AssetService.getInstance(this.app);
    await assetService.initialize();

    return assetService.rewriteAssets((asset: Asset): boolean => {
      let changed = false;
      switch (asset.type) {
        case 'token': {
          if (pathMatches(asset.imagePath, oldPath)) {
            asset.imagePath = newPath;
            changed = true;
          }
          if (asset.statblockPath && pathMatches(asset.statblockPath, oldPath)) {
            asset.statblockPath = newPath;
            changed = true;
          }
          break;
        }
        case 'encounter':
        case 'player': {
          if (asset.tokens) {
            for (const tok of asset.tokens) {
              if (tok.imagePath && pathMatches(tok.imagePath, oldPath)) {
                tok.imagePath = newPath;
                changed = true;
              }
              if (tok.statblockPath && pathMatches(tok.statblockPath, oldPath)) {
                tok.statblockPath = newPath;
                changed = true;
              }
            }
          }
          break;
        }
        case 'map': {
          if (pathMatches(asset.mapFilePath, oldPath)) {
            asset.mapFilePath = newPath;
            changed = true;
          }
          break;
        }
        case 'note': {
          if (pathMatches(asset.notePath, oldPath)) {
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
  // Scenes and thumbnails of a renamed map
  // ---------------------------------------------------------------------------

  /** Scene records follow their map; a scene named after its file takes the new file name. */
  private async updateScenes(oldPath: string, newPath: string): Promise<void> {
    if (!newPath.endsWith('.atlasmap')) return;
    const assetService = AssetService.getInstance(this.app);
    const scenes = (await assetService.getAssets(undefined, 'scene'))
      .filter((scene) => pathMatches(scene.data?.mapPath, oldPath));

    for (const scene of scenes) {
      await assetService.updateAsset(scene.id, {
        data: { ...scene.data, mapPath: newPath },
        ...(scene.name === basename(oldPath) ? { name: basename(newPath) } : {}),
      });
    }
  }

  private async renameMapThumbnail(oldPath: string, newPath: string): Promise<void> {
    if (!oldPath.endsWith('.atlasmap') || !newPath.endsWith('.atlasmap')) return;
    const thumbnail = this.app.vault.getAbstractFileByPath(mapThumbnailPath(oldPath));
    const target = mapThumbnailPath(newPath);
    if (!(thumbnail instanceof TFile) || this.app.vault.getAbstractFileByPath(target)) return;
    try {
      await this.app.vault.rename(thumbnail, target);
    } catch (error) {
      console.error(`[FileReferenceService] Error renaming thumbnail ${thumbnail.path}:`, error);
    }
  }

  // ---------------------------------------------------------------------------
  // .atlasmap files
  // ---------------------------------------------------------------------------

  private async updateMapFiles(oldPath: string, newPath: string): Promise<boolean> {
    const mapFiles = this.app.vault.getFiles().filter(f => f.extension === 'atlasmap');
    const snapshots = new SceneSnapshotService(this.app);
    let anyChanged = false;

    /** Returns the rewritten map JSON, or null when the map does not reference the old path. */
    const rewriteMap = (content: string): string | null => {
      const mapData: unknown = JSON.parse(content);
      if (!isPersistedMapEnvelope(mapData)) return null;
      return rewriteMapReferences(mapData.state?.objects, oldPath, newPath) ? JSON.stringify(mapData, null, 2) : null;
    };

    for (const mapFile of mapFiles) {
      try {
        if (rewriteMap(await this.app.vault.read(mapFile)) !== null) {
          await this.app.vault.process(mapFile, (latest) => rewriteMap(latest) ?? latest);
          anyChanged = true;
        }
      } catch (error) {
        console.error(`[FileReferenceService] Error updating map ${mapFile.path}:`, error);
      }
      // Scene snapshots hold the same map state, so they follow renamed files too.
      try {
        if (await snapshots.rewriteFiles(mapFile.path, rewriteMap)) anyChanged = true;
      } catch (error) {
        console.error(`[FileReferenceService] Error updating snapshots of ${mapFile.path}:`, error);
      }
    }

    return anyChanged;
  }

  // ---------------------------------------------------------------------------
  // Statblock frontmatter (token-image field)
  // ---------------------------------------------------------------------------

  private async updateStatblockFrontmatter(oldPath: string, newPath: string): Promise<void> {
    // Find statblock .md files whose frontmatter token-image matches the old path
    const mdFiles = this.app.vault.getFiles().filter(f => f.extension === 'md');

    for (const mdFile of mdFiles) {
      try {
        const cache = this.app.metadataCache.getFileCache(mdFile);
        if (!cache?.frontmatter) continue;

        const tokenImage: unknown = cache.frontmatter['token-image'];
        if (typeof tokenImage !== 'string' || !tokenImage) continue;

        if (!pathMatches(tokenImage, oldPath)) continue;

        await this.app.fileManager.processFrontMatter(mdFile, (frontmatter: Record<string, unknown>) => {
          frontmatter['token-image'] = newPath;
        });
      } catch (error) {
        console.error(`[FileReferenceService] Error updating frontmatter in ${mdFile.path}:`, error);
      }
    }
  }
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
