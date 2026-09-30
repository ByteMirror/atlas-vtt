import { TFile, type App } from 'obsidian';
import type { StatblockImportCandidate } from '../../../../services/statblockImportCandidates';
import type { PreviewImage } from './types';
import { vaultImageFile } from './vaultImageFile';

/** Reads source artwork into the same file intake as OS uploads; nothing is saved yet. */
export async function statblockPreviewImages(
  app: App, rows: readonly StatblockImportCandidate[], signal: AbortSignal, onProgress?: (done: number, total: number) => void,
): Promise<PreviewImage[]> {
  const images: PreviewImage[] = [];
  // Statblocks often share their art: each image is read once, and its conversions then run once (`tokenImages`)
  const read = new Map<string, File>();
  for (const row of rows) {
    if (signal.aborted) return [];
    onProgress?.(images.length, rows.length);
    const file = row.imagePath ? app.vault.getAbstractFileByPath(row.imagePath) : null;
    if (!(file instanceof TFile)) throw new Error(`The image for ${row.name} no longer exists. Scan again.`);
    let image = read.get(file.path);
    if (!image) {
      image = await vaultImageFile(app, file);
      read.set(file.path, image);
    }
    images.push({ file: image, name: row.name, statblockPath: row.path, ...(row.size !== undefined && { size: row.size }) });
  }
  return signal.aborted ? [] : images;
}
