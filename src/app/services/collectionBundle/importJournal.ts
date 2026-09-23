import { TFile, type App } from 'obsidian';
import { AtlasView, ATLAS_VIEW_TYPE } from '../../atlas-view';
import { ensureFolder } from '../../plugin/vaultFolders';
import { COLLECTION_DATA_DIR, ensureHiddenFolder } from './installRecord';

interface JournalEntry {
  path: string;
  /** Where the file's previous content was backed up; null when the import created the file. */
  backup: string | null;
}

const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** `2026-09-23 19-30-05`: sortable, and valid as a folder name everywhere. */
function timestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Writes and removes vault files for an import so that it can be undone: every
 * file it replaces or deletes is first copied to a hidden backup folder, and
 * `rollback` restores those copies and removes the files it created.
 */
export class ImportJournal {
  private readonly entries: JournalEntry[] = [];
  private backups = 0;
  readonly backupFolder: string;

  constructor(private readonly app: App, collectionId: string, now = new Date()) {
    this.backupFolder = `${COLLECTION_DATA_DIR}/backups/${collectionId}/${timestamp(now)}`;
  }

  /** How many files were backed up. */
  get backupCount(): number {
    return this.backups;
  }

  async write(path: string, content: ArrayBuffer): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      const backup = await this.backUp(existing);
      await closeMapViews(this.app, path);
      this.entries.push({ path, backup });
      await this.app.vault.modifyBinary(existing, content);
    } else {
      await ensureFolder(this.app, parentOf(path));
      this.entries.push({ path, backup: null });
      await this.app.vault.createBinary(path, content);
    }
  }

  async remove(path: string): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!(existing instanceof TFile)) return;
    const backup = await this.backUp(existing);
    await closeMapViews(this.app, path);
    this.entries.push({ path, backup });
    await this.app.fileManager.trashFile(existing);
  }

  /** Undoes every write and removal, newest first. Returns the paths it could not restore. */
  async rollback(): Promise<string[]> {
    const failed: string[] = [];
    for (const entry of [...this.entries].reverse()) {
      try {
        const current = this.app.vault.getAbstractFileByPath(entry.path);
        if (entry.backup === null) {
          if (current instanceof TFile) await this.app.fileManager.trashFile(current);
          continue;
        }
        const content = await this.app.vault.adapter.readBinary(entry.backup);
        if (current instanceof TFile) await this.app.vault.modifyBinary(current, content);
        else {
          await ensureFolder(this.app, parentOf(entry.path));
          await this.app.vault.createBinary(entry.path, content);
        }
      } catch (error) {
        console.error(`[ImportJournal] Could not restore ${entry.path}:`, error);
        failed.push(entry.path);
      }
    }
    this.entries.length = 0;
    return failed;
  }

  private async backUp(file: TFile): Promise<string> {
    const backup = `${this.backupFolder}/${file.path}`;
    await ensureHiddenFolder(this.app, parentOf(backup));
    await this.app.vault.adapter.writeBinary(backup, await this.app.vault.readBinary(file));
    this.backups += 1;
    return backup;
  }
}

/**
 * An open Atlas view would save its stale state over a map file the import
 * replaces. Its pending saves are written first, so none lands after the import.
 */
export async function closeMapViews(app: App, mapPath: string): Promise<void> {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    if (leaf.view.getState().file !== mapPath) continue;
    if (leaf.view instanceof AtlasView) await leaf.view.saveMap();
    leaf.detach();
  }
}

/** Writes pending saves of open views of `paths`, so the vault holds what the user sees before it is compared. */
export async function saveOpenMaps(app: App, paths: ReadonlySet<string>): Promise<void> {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const file = leaf.view.getState().file;
    if (typeof file === 'string' && paths.has(file) && leaf.view instanceof AtlasView) await leaf.view.saveMap();
  }
}
