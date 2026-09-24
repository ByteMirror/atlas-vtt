import type { App, TFile } from 'obsidian';
import { isPersistedMapEnvelope, type PersistedMapEnvelope } from '../services/MapPersistence';
import { ensureHiddenFolder, removeEmptyHiddenFolders, trashHiddenPath } from '../utils/hiddenVaultFiles';
import { createSnapshot, isSceneSnapshot, restoreSnapshot, type SceneSnapshot } from './sceneSnapshotFormat';
import { parentFolderOf, snapshotFilePath, snapshotFolderFor, snapshotThumbnailPath } from './snapshotPaths';

export interface SceneSnapshotEntry {
  snapshot: SceneSnapshot;
  /** Vault path of the snapshot file (hidden from the vault index). */
  path: string;
  /** Vault path of its thumbnail, when it has one. */
  thumbnailPath: string | null;
}

const DEFAULT_NAME = 'Snapshot';

/** The first free default name: "Snapshot 3" when "Snapshot 1" and "Snapshot 2" exist. */
export function nextSnapshotName(existingNames: readonly string[]): string {
  const taken = new Set(existingNames);
  let n = existingNames.length + 1;
  while (taken.has(`${DEFAULT_NAME} ${n}`)) n++;
  return `${DEFAULT_NAME} ${n}`;
}

function parseJson(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Reads and writes the snapshots of a scene: one JSON file per snapshot plus
 * a JPEG thumbnail, in a hidden folder beside the scene's map file (see
 * `snapshotFolderFor`). The vault does not index that folder, so every file
 * operation goes through the adapter. Works on files only; the open map view
 * flushes and reloads around it.
 */
export class SceneSnapshotService {
  constructor(private readonly app: App) {}

  /** The scene's snapshots, newest first. Files that cannot be read are skipped. */
  async list(mapPath: string): Promise<SceneSnapshotEntry[]> {
    const { adapter } = this.app.vault;
    const folder = snapshotFolderFor(mapPath);
    if (!(await adapter.exists(folder))) return [];

    const { files } = await adapter.list(folder);
    const fileSet = new Set(files);
    const entries: SceneSnapshotEntry[] = [];
    for (const path of files) {
      if (!path.endsWith('.json')) continue;
      const snapshot = await this.read(path);
      if (!snapshot) continue;
      const thumbnailPath = snapshotThumbnailPath(folder, snapshot.id);
      entries.push({ snapshot, path, thumbnailPath: fileSet.has(thumbnailPath) ? thumbnailPath : null });
    }
    return entries.sort((a, b) => b.snapshot.createdAt - a.snapshot.createdAt);
  }

  /** An image URL for the entry's thumbnail that changes whenever the snapshot is overwritten. */
  thumbnailUrl(entry: SceneSnapshotEntry): string | null {
    if (!entry.thumbnailPath) return null;
    const url = this.app.vault.adapter.getResourcePath(entry.thumbnailPath);
    const version = entry.snapshot.updatedAt ?? entry.snapshot.createdAt;
    return `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
  }

  /** Saves what the map file holds now as a new snapshot. Flush pending map saves first. */
  async create(mapFile: TFile, name: string, thumbnail: ArrayBuffer | null): Promise<SceneSnapshot> {
    const envelope = await this.readMap(mapFile);
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot = createSnapshot(envelope, id, name, Date.now());
    const folder = snapshotFolderFor(mapFile.path);
    await ensureHiddenFolder(this.app, folder);
    await this.app.vault.adapter.write(snapshotFilePath(folder, id), JSON.stringify(snapshot));
    if (thumbnail) await this.app.vault.adapter.writeBinary(snapshotThumbnailPath(folder, id), thumbnail);
    return snapshot;
  }

  /**
   * Replaces the snapshot's state and thumbnail with what the map file holds
   * now. It keeps its id, name and creation time. Flush pending map saves first.
   */
  async overwrite(entry: SceneSnapshotEntry, mapFile: TFile, thumbnail: ArrayBuffer | null): Promise<SceneSnapshot> {
    const { id, name, createdAt } = entry.snapshot;
    const snapshot: SceneSnapshot = { ...createSnapshot(await this.readMap(mapFile), id, name, createdAt), updatedAt: Date.now() };
    await this.app.vault.adapter.write(entry.path, JSON.stringify(snapshot));
    if (thumbnail) await this.app.vault.adapter.writeBinary(snapshotThumbnailPath(parentFolderOf(entry.path), id), thumbnail);
    return snapshot;
  }

  async rename(entry: SceneSnapshotEntry, name: string): Promise<void> {
    const snapshot = await this.read(entry.path);
    if (snapshot) await this.app.vault.adapter.write(entry.path, JSON.stringify({ ...snapshot, name }));
  }

  /** Moves the snapshot and its thumbnail to the trash, and removes folders it leaves empty. */
  async delete(entry: SceneSnapshotEntry): Promise<void> {
    await trashHiddenPath(this.app, entry.path);
    if (entry.thumbnailPath) await trashHiddenPath(this.app, entry.thumbnailPath);
    const folder = parentFolderOf(entry.path);
    await removeEmptyHiddenFolders(this.app, folder, parentFolderOf(parentFolderOf(folder)));
  }

  /** Writes the snapshot's state into the map file. The open view must reload the map afterwards. */
  async restoreInto(mapFile: TFile, snapshot: SceneSnapshot): Promise<void> {
    await this.app.vault.process(mapFile, (data) => {
      const parsed = parseJson(data);
      const current: PersistedMapEnvelope = isPersistedMapEnvelope(parsed) ? parsed : {};
      return JSON.stringify(restoreSnapshot(current, snapshot, mapFile.path));
    });
  }

  /**
   * Runs `rewrite` over every snapshot file of the scene and saves the files
   * it returns new content for. Returns whether any file changed.
   */
  async rewriteFiles(mapPath: string, rewrite: (content: string) => string | null): Promise<boolean> {
    let changed = false;
    for (const { path } of await this.list(mapPath)) {
      const content = rewrite(await this.app.vault.adapter.read(path));
      if (content === null) continue;
      await this.app.vault.adapter.write(path, content);
      changed = true;
    }
    return changed;
  }

  private async readMap(mapFile: TFile): Promise<PersistedMapEnvelope> {
    const envelope = parseJson(await this.app.vault.read(mapFile));
    if (!isPersistedMapEnvelope(envelope) || !envelope.state) {
      throw new Error(`Map file cannot be read: ${mapFile.path}`);
    }
    return envelope;
  }

  private async read(path: string): Promise<SceneSnapshot | null> {
    const parsed = parseJson(await this.app.vault.adapter.read(path));
    return isSceneSnapshot(parsed) ? parsed : null;
  }
}
