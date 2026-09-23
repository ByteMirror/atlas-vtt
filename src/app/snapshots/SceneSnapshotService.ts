import { TFile, type App } from 'obsidian';
import { ensureFolder } from '../plugin/vaultFolders';
import { isPersistedMapEnvelope, type PersistedMapEnvelope } from '../services/MapPersistence';
import { createSnapshot, isSceneSnapshot, restoreSnapshot, type SceneSnapshot } from './sceneSnapshotFormat';
import { snapshotFilePath, snapshotFolderFor, snapshotThumbnailPath } from './snapshotPaths';

export interface SceneSnapshotEntry {
  snapshot: SceneSnapshot;
  file: TFile;
  thumbnail: TFile | null;
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
 * a JPEG thumbnail, in a folder next to the scene's map file. Works on files
 * only; the open map view flushes and reloads around it.
 */
export class SceneSnapshotService {
  constructor(private readonly app: App) {}

  /** The scene's snapshots, newest first. Files that cannot be read are skipped. */
  async list(mapPath: string): Promise<SceneSnapshotEntry[]> {
    const folder = this.app.vault.getFolderByPath(snapshotFolderFor(mapPath));
    if (!folder) return [];

    const entries: SceneSnapshotEntry[] = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== 'json') continue;
      const snapshot = await this.read(child);
      if (!snapshot) continue;
      const thumbnail = this.app.vault.getFileByPath(snapshotThumbnailPath(folder.path, snapshot.id));
      entries.push({ snapshot, file: child, thumbnail });
    }
    return entries.sort((a, b) => b.snapshot.createdAt - a.snapshot.createdAt);
  }

  /** Saves what the map file holds now as a new snapshot. Flush pending map saves first. */
  async create(mapFile: TFile, name: string, thumbnail: ArrayBuffer | null): Promise<SceneSnapshot> {
    const envelope = parseJson(await this.app.vault.read(mapFile));
    if (!isPersistedMapEnvelope(envelope) || !envelope.state) {
      throw new Error(`Map file cannot be read: ${mapFile.path}`);
    }

    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const snapshot = createSnapshot(envelope, id, name, Date.now());
    const folder = snapshotFolderFor(mapFile.path);
    await ensureFolder(this.app, folder);
    await this.app.vault.create(snapshotFilePath(folder, id), JSON.stringify(snapshot));
    if (thumbnail) await this.app.vault.createBinary(snapshotThumbnailPath(folder, id), thumbnail);
    return snapshot;
  }

  async rename(entry: SceneSnapshotEntry, name: string): Promise<void> {
    await this.app.vault.process(entry.file, (data) => {
      const snapshot = parseJson(data);
      return isSceneSnapshot(snapshot) ? JSON.stringify({ ...snapshot, name }) : data;
    });
  }

  /** Moves the snapshot and its thumbnail to the trash, and the folder too once it is empty. */
  async delete(entry: SceneSnapshotEntry): Promise<void> {
    const folderPath = entry.file.path.slice(0, entry.file.path.lastIndexOf('/'));
    await this.app.fileManager.trashFile(entry.file);
    if (entry.thumbnail) await this.app.fileManager.trashFile(entry.thumbnail);

    const folder = this.app.vault.getFolderByPath(folderPath);
    if (folder && folder.children.length === 0) await this.app.fileManager.trashFile(folder);
  }

  /** Writes the snapshot's state into the map file. The open view must reload the map afterwards. */
  async restoreInto(mapFile: TFile, snapshot: SceneSnapshot): Promise<void> {
    await this.app.vault.process(mapFile, (data) => {
      const parsed = parseJson(data);
      const current: PersistedMapEnvelope = isPersistedMapEnvelope(parsed) ? parsed : {};
      return JSON.stringify(restoreSnapshot(current, snapshot, mapFile.path));
    });
  }

  private async read(file: TFile): Promise<SceneSnapshot | null> {
    const parsed = parseJson(await this.app.vault.read(file));
    return isSceneSnapshot(parsed) ? parsed : null;
  }
}
