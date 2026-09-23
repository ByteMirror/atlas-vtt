import type { Asset, CollectionMetadata } from '../AssetService';
import { isRecord } from '../assetMetadataGuards';

/** Bumped when the zip layout or manifest shape changes. */
export const BUNDLE_FORMAT = 2;
export const BUNDLE_MANIFEST = 'manifest.json';
/** Vault files are stored under this folder with their vault path, so nothing is lost or renamed. */
export const BUNDLE_FILES_DIR = 'files';

export type BundleFileRole =
  /** The file that backs an asset record (token image, map JSON, scene/encounter/player JSON). */
  | 'asset-file'
  | 'thumbnail'
  | 'scene-map'
  | 'scene-thumbnail'
  | 'background'
  | 'token-image'
  | 'statblock-note'
  | 'statblock-image';

/** The frontmatter field of a statblock note that points at its artwork. */
export type StatblockImageKey = 'image' | 'token-image';

export interface BundleFile {
  vaultPath: string;
  role: BundleFileRole;
  /** For statblock notes: the frontmatter field and the vault path it resolved to at export time. */
  statblockImage?: { key: StatblockImageKey; path: string };
}

/** manifest.json inside an exported collection zip. */
export interface CollectionBundleManifest {
  format: number;
  exportedAt: number;
  collection: CollectionMetadata;
  assets: Asset[];
  files: BundleFile[];
}

export const zipPathFor = (vaultPath: string): string => `${BUNDLE_FILES_DIR}/${vaultPath}`;

const isBundleFile = (value: unknown): value is BundleFile =>
  isRecord(value) && typeof value.vaultPath === 'string' && typeof value.role === 'string';

/** Trust boundary for an imported bundle: checks the containers the importer walks, not every asset field. */
export function isCollectionBundleManifest(value: unknown): value is CollectionBundleManifest {
  return isRecord(value)
    && value.format === BUNDLE_FORMAT
    && typeof value.exportedAt === 'number'
    && isRecord(value.collection)
    && typeof value.collection.uid === 'string'
    && typeof value.collection.name === 'string'
    && Array.isArray(value.assets)
    && value.assets.every((asset) => isRecord(asset) && typeof asset.id === 'string' && typeof asset.type === 'string')
    && Array.isArray(value.files)
    && value.files.every(isBundleFile);
}
