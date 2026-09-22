import { TFile, type App } from 'obsidian';
import type { StatblockImportCandidate } from '../../../../services/statblockImportCandidates';
import type { PreviewImage } from './types';

/** Reads source artwork into the same file intake as OS uploads; nothing is saved yet. */
export async function statblockPreviewImages(app: App, rows: readonly StatblockImportCandidate[], signal: AbortSignal): Promise<PreviewImage[]> {
  const images: PreviewImage[] = [];
  for (const row of rows) {
    if (signal.aborted) return [];
    const file = row.imagePath ? app.vault.getAbstractFileByPath(row.imagePath) : null;
    if (!(file instanceof TFile)) throw new Error(`The image for ${row.name} no longer exists. Scan again.`);
    const data = await app.vault.readBinary(file);
    const extension = file.extension.toLowerCase();
    const type = `image/${extension === 'jpg' ? 'jpeg' : extension === 'svg' ? 'svg+xml' : extension}`;
    images.push({ file: new File([data], file.name, { type }), name: row.name, statblockPath: row.path, ...(row.size !== undefined && { size: row.size }) });
  }
  return signal.aborted ? [] : images;
}
