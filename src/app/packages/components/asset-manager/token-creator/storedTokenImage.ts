import { TFile, type App } from 'obsidian';
import { vaultImageFile } from './vaultImageFile';
import type { EditTokenInput } from './types';

/** The edited token's image as an upload, so an edit without a new image can crop it. */
export async function storedImageFile(app: App, editToken: EditTokenInput): Promise<File> {
  const file = editToken.imagePath ? app.vault.getAbstractFileByPath(editToken.imagePath) : null;
  if (!(file instanceof TFile)) throw new Error(`The image of ${editToken.name} no longer exists, so it cannot be cropped.`);
  return vaultImageFile(app, file);
}

/**
 * Writes an edited token's new WebP image over its stored one and returns the path, or
 * null when the token has no image in the vault. A new file would leave the old one in
 * the collection's tokens folder, where the vault check adopts it as a second token;
 * overwriting also updates the token wherever it is placed. A file of another format is
 * renamed to `.webp` first, which references follow like any rename.
 */
export async function overwriteStoredImage(app: App, imagePath: string | undefined, data: ArrayBuffer): Promise<string | null> {
  const file = imagePath ? app.vault.getAbstractFileByPath(imagePath) : null;
  if (!(file instanceof TFile)) return null;
  let target = file;
  if (file.extension.toLowerCase() !== 'webp') {
    const stem = file.path.slice(0, file.path.length - file.extension.length - 1);
    const path = app.vault.getAbstractFileByPath(`${stem}.webp`) ? `${stem}_${Date.now()}.webp` : `${stem}.webp`;
    await app.fileManager.renameFile(file, path);
    const renamed = app.vault.getAbstractFileByPath(path);
    if (renamed instanceof TFile) target = renamed;
  }
  await app.vault.modifyBinary(target, data);
  return target.path;
}
