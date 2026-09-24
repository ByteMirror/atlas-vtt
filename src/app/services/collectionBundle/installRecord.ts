import type { App } from 'obsidian';
import { ensureAdapterFolder } from '../../plugin/vaultFolders';
import { ATLAS_VTT_DIR } from '../AssetService';
import { isRecord } from '../assetMetadataGuards';

/** Hidden, so Obsidian never indexes install records or backups. */
export const COLLECTION_DATA_DIR = `${ATLAS_VTT_DIR}/.atlas-data`;
const INSTALLS_DIR = `${COLLECTION_DATA_DIR}/installs`;

/** The collection record fields an update compares one by one. */
export const COLLECTION_FIELDS = ['name', 'description', 'tags', 'settings'] as const;
export type CollectionField = typeof COLLECTION_FIELDS[number];

/**
 * One installed item as two fingerprints: `source` is what the bundle carried,
 * `installed` what the import left in the vault (paths rewritten, notes relinked).
 * A later bundle changed the item when its source differs; the user changed it
 * when the vault no longer matches `installed`.
 */
export interface InstalledItem {
  source: string;
  installed: string;
}

interface InstalledFile extends InstalledItem {
  /** Where the file lives in this vault. */
  target: string;
  /** The plan unit the file belongs to, so a later update can group its removal. */
  unit?: string;
}

interface InstalledAsset extends InstalledItem {
  /** The record's id in this vault, which differs from the bundle's when it collided. */
  localId: string;
}

/** What the vault got from a collection's last import or export: the baseline of the next update. */
export interface InstallRecord {
  uid: string;
  collectionId: string;
  /** The collection's id in the bundles it came from; bundle paths live under that folder. */
  sourceCollectionId: string;
  /** The collection's name in the bundles it came from, which shares keep unless the user renamed it. */
  sourceName: string;
  version: number;
  releasedAt: number;
  installedAt: number;
  /** Keyed by the file's path in the bundle. */
  files: Record<string, InstalledFile>;
  /** Keyed by the asset's id in the bundle. */
  assets: Record<string, InstalledAsset>;
  fields: Partial<Record<CollectionField, InstalledItem>>;
}

const recordPath = (uid: string): string => `${INSTALLS_DIR}/${uid}.json`;

function isInstallRecord(value: unknown): value is InstallRecord {
  return isRecord(value)
    && typeof value.uid === 'string'
    && typeof value.collectionId === 'string'
    && typeof value.version === 'number'
    && isRecord(value.files)
    && isRecord(value.assets)
    && isRecord(value.fields);
}

export async function readInstallRecord(app: App, uid: string): Promise<InstallRecord | null> {
  const path = recordPath(uid);
  if (!(await app.vault.adapter.exists(path))) return null;
  try {
    const parsed: unknown = JSON.parse(await app.vault.adapter.read(path));
    return isInstallRecord(parsed) ? parsed : null;
  } catch (error) {
    console.error(`[installRecord] Unreadable install record ${path}:`, error);
    return null;
  }
}

export async function writeInstallRecord(app: App, record: InstallRecord): Promise<void> {
  await ensureAdapterFolder(app, INSTALLS_DIR);
  await app.vault.adapter.write(recordPath(record.uid), JSON.stringify(record));
}

export async function deleteInstallRecord(app: App, uid: string): Promise<void> {
  const path = recordPath(uid);
  if (await app.vault.adapter.exists(path)) await app.vault.adapter.remove(path);
}
