import { App, TFolder, normalizePath } from 'obsidian';

/**
 * Returns the vault folder at `path`, creating it when missing.
 * Tolerates another writer creating the same folder concurrently.
 */
export async function ensureFolder(app: App, path: string): Promise<TFolder> {
  const normalizedPath = normalizePath(path);

  const existing = app.vault.getAbstractFileByPath(normalizedPath);
  if (existing instanceof TFolder) return existing;
  if (existing) {
    throw new Error(`Path exists but is not a folder: ${normalizedPath}`);
  }

  try {
    await app.vault.createFolder(normalizedPath);
  } catch (error: unknown) {
    const alreadyExists = error instanceof Error && error.message.includes('already exists');
    if (!alreadyExists && !app.vault.getFolderByPath(normalizedPath)) {
      throw error;
    }
  }

  const folder = app.vault.getFolderByPath(normalizedPath);
  if (!folder) {
    throw new Error(`Failed to get folder reference after creation: ${normalizedPath}`);
  }
  return folder;
}
