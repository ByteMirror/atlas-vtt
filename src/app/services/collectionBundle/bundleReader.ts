import type JSZip from 'jszip';
import { BUNDLE_MANIFEST, manifestProblem, zipPathFor, type BundleFile, type CollectionBundleManifest } from './bundleFormat';
import { reportFileStep, type BundleProgressListener } from './bundleProgress';
import { sha256 } from './hashing';
import { baseName } from '../../utils/pathUtils';
import { plural } from '../../utils/plural';

/** A bundle whose manifest is sound and whose files match their checksums. */
export interface OpenedBundle {
  zip: JSZip;
  manifest: CollectionBundleManifest;
  /** SHA-256 of every packed file's bytes, by bundle path. Files the manifest lists but the zip lacks are absent. */
  sourceHashes: Map<string, string>;
}

async function readManifest(zip: JSZip): Promise<CollectionBundleManifest> {
  const entry = zip.file(BUNDLE_MANIFEST);
  if (!entry) throw new Error('This file is not an Atlas collection export.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await entry.async('string'));
  } catch {
    throw new Error('This collection export is damaged.');
  }
  const problem = manifestProblem(parsed);
  if (problem) throw new Error(problem);
  return parsed as CollectionBundleManifest;
}

/** Reads the zip and checks every file against its recorded checksum before anything is written. */
export async function openBundle(data: Blob, onProgress: BundleProgressListener): Promise<OpenedBundle> {
  onProgress({ message: 'Reading bundle…', fraction: 0 });
  const { default: JSZip } = await import('jszip');
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await data.arrayBuffer());
  } catch {
    throw new Error('This file is not a readable zip archive.');
  }
  const manifest = await readManifest(zip);

  const sourceHashes = new Map<string, string>();
  const damaged: BundleFile[] = [];
  for (const [index, file] of manifest.files.entries()) {
    reportFileStep(onProgress, 'Checking', index, manifest.files.length, 0, 0.5);
    const entry = zip.file(zipPathFor(file.vaultPath));
    if (!entry) {
      if (file.sha256) damaged.push(file);
      continue;
    }
    const hash = await sha256(await entry.async('uint8array'));
    if (file.sha256 && file.sha256 !== hash) damaged.push(file);
    sourceHashes.set(file.vaultPath, hash);
  }
  if (damaged.length > 0) {
    const names = damaged.slice(0, 3).map((file) => baseName(file.vaultPath)).join(', ');
    throw new Error(`This collection export is damaged: ${plural(damaged.length, 'file')} ${damaged.length === 1 ? 'does' : 'do'} not match ${damaged.length === 1 ? 'its' : 'their'} checksum (${names}${damaged.length > 3 ? ', …' : ''}). Nothing was imported.`);
  }
  return { zip, manifest, sourceHashes };
}
