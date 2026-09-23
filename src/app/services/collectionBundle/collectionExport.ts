import { TFile, type App } from 'obsidian';
import type { AssetService } from '../AssetService';
import { BUNDLE_FORMAT, BUNDLE_MANIFEST, zipPathFor, type CollectionBundleManifest } from './bundleFormat';
import { CollectionReferenceCollector } from './collectionReferences';

export interface BundleProgress {
  message: string;
  /** 0..1 */
  fraction: number;
}
export type BundleProgressListener = (progress: BundleProgress) => void;

/** Images and audio are already compressed; deflating them only costs time. */
const STORED_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|mp3|ogg|wav|m4a|zip)$/i;

/**
 * Packs a collection with every file it depends on into a zip. Files keep
 * their vault paths inside the archive; the manifest lists them with their
 * roles so the importer can place and rewrite them.
 */
export async function exportCollectionBundle(
  app: App,
  assets: AssetService,
  collectionId: string,
  onProgress: BundleProgressListener = () => undefined,
): Promise<Blob> {
  const collection = await assets.getCollection(collectionId);
  if (!collection) throw new Error(`Collection ${collectionId} not found`);

  onProgress({ message: 'Collecting files…', fraction: 0 });
  const collectionAssets = await assets.getAssets(collectionId);
  const files = await new CollectionReferenceCollector(app, assets).collect(collectionAssets);

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const manifest: CollectionBundleManifest = {
    format: BUNDLE_FORMAT,
    exportedAt: Date.now(),
    collection,
    assets: collectionAssets,
    files,
  };
  zip.file(BUNDLE_MANIFEST, JSON.stringify(manifest, null, 2));

  for (const [index, file] of files.entries()) {
    onProgress({ message: `Adding ${index + 1} of ${files.length} files…`, fraction: (index / files.length) * 0.6 });
    const vaultFile = app.vault.getAbstractFileByPath(file.vaultPath);
    if (!(vaultFile instanceof TFile)) continue;
    zip.file(zipPathFor(file.vaultPath), await app.vault.readBinary(vaultFile), {
      compression: STORED_EXTENSIONS.test(file.vaultPath) ? 'STORE' : 'DEFLATE',
    });
  }

  return zip.generateAsync({ type: 'blob', streamFiles: true }, ({ percent }) => {
    onProgress({ message: 'Compressing…', fraction: 0.6 + (percent / 100) * 0.4 });
  });
}
