import { TFile, type App } from 'obsidian';
import { AtlasView, ATLAS_VIEW_TYPE } from '../../atlas-view';
import { ensureAdapterFolder, ensureFolder } from '../../plugin/vaultFolders';
import { parentPath } from '../../utils/pathUtils';
import { COLLECTION_DATA_DIR } from './installRecord';

interface JournalEntry {
  path: string;
  /** Where the file's previous content was backed up; null when the import created the file. */
  backup: string | null;
}

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
  private readonly backupFolders = new Set<string>();
  readonly backupFolder: string;

  constructor(private readonly app: App, collectionId: string) {
    this.backupFolder = `${COLLECTION_DATA_DIR}/backups/${collectionId}/${timestamp(new Date())}`;
  }

  /** How many files were backed up. */
  get backupCount(): number {
    return this.entries.filter((entry) => entry.backup !== null).length;
  }

  async write(path: string, content: ArrayBuffer): Promise<void> {
    const existing = await this.prepare(path);
    if (existing) {
      await this.app.vault.modifyBinary(existing, content);
      return;
    }
    await ensureFolder(this.app, parentPath(path));
    this.entries.push({ path, backup: null });
    await this.app.vault.createBinary(path, content);
  }

  async remove(path: string): Promise<void> {
    const existing = await this.prepare(path);
    if (existing) await this.app.fileManager.trashFile(existing);
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
          await ensureFolder(this.app, parentPath(entry.path));
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

  /** Backs up the file at `path`, closes map views of it and journals the change; returns the file, or null when there is none. */
  private async prepare(path: string): Promise<TFile | null> {
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!(existing instanceof TFile)) return null;
    const backup = `${this.backupFolder}/${path}`;
    await ensureAdapterFolder(this.app, parentPath(backup), this.backupFolders);
    await this.app.vault.adapter.writeBinary(backup, await this.app.vault.readBinary(existing));
    await forOpenMaps(this.app, (file) => file === path, async (view, detach) => {
      await view.saveMap();
      detach();
    });
    this.entries.push({ path, backup });
    return existing;
  }
}

/** Calls `visit` for every open Atlas view whose map `matches`, with a way to close it. */
async function forOpenMaps(app: App, matches: (file: string) => boolean, visit: (view: AtlasView, detach: () => void) => Promise<void>): Promise<void> {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const file = leaf.view.getState().file;
    if (typeof file === 'string' && matches(file) && leaf.view instanceof AtlasView) await visit(leaf.view, () => leaf.detach());
  }
}

/** Writes pending saves of open views of `paths`, so the vault holds what the user sees before it is compared. */
export async function saveOpenMaps(app: App, paths: ReadonlySet<string>): Promise<void> {
  await forOpenMaps(app, (file) => paths.has(file), (view) => view.saveMap());
}
