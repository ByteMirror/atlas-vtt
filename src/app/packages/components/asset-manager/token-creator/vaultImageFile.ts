import type { App, TFile } from 'obsidian';

/** Reads a vault image into the same `File` shape as an OS upload. */
export async function vaultImageFile(app: App, file: TFile): Promise<File> {
  const extension = file.extension.toLowerCase();
  const type = `image/${extension === 'jpg' ? 'jpeg' : extension === 'svg' ? 'svg+xml' : extension}`;
  return new File([await app.vault.readBinary(file)], file.name, { type });
}
