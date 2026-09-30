import type { App, TAbstractFile } from 'obsidian';

/**
 * Moves `item` to the trash. An item already gone from disk counts as trashed:
 * Obsidian's file list can trail the disk when files change outside Obsidian
 * (git, sync tools), and trashing such an item fails although nothing is left
 * to remove. Any other failure is thrown.
 */
export async function trashVaultItem(app: App, item: TAbstractFile): Promise<void> {
  try {
    await app.fileManager.trashFile(item);
  } catch (error) {
    if (await app.vault.adapter.exists(item.path)) throw error;
  }
}
