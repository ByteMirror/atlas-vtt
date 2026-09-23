import type { Asset, CollectionMetadata } from '../AssetService';
import { isRecord } from '../assetMetadataGuards';

/** Bumped when the zip layout or manifest shape changes. */
export const BUNDLE_FORMAT = 3;
/** Oldest format this version still imports. */
const OLDEST_BUNDLE_FORMAT = 2;
export const BUNDLE_MANIFEST = 'manifest.json';
/** Vault files are stored under this folder with their vault path, so nothing is lost or renamed. */
export const BUNDLE_FILES_DIR = 'files';

/** `asset-file` is the file that backs an asset record: token image, map JSON, scene, encounter or player JSON. */
const BUNDLE_FILE_ROLES = [
  'asset-file', 'thumbnail', 'scene-map', 'scene-thumbnail', 'background', 'token-image', 'statblock-note', 'statblock-image',
] as const;
export type BundleFileRole = typeof BUNDLE_FILE_ROLES[number];

/** Roles of files that live outside `atlas-vtt/` in the exporting vault. */
const FOREIGN_FILE_ROLES: ReadonlySet<BundleFileRole> = new Set<BundleFileRole>(['statblock-note', 'statblock-image']);

/** The frontmatter field of a statblock note that points at its artwork. */
export type StatblockImageKey = 'image' | 'token-image';

export interface BundleFile {
  vaultPath: string;
  role: BundleFileRole;
  /** For statblock notes: the frontmatter field and the vault path it resolved to at export time. */
  statblockImage?: { key: StatblockImageKey; path: string };
  /** SHA-256 of the bytes in the zip (format 3). */
  sha256?: string;
  /** Ids of the bundle's assets that use this file (format 3). */
  owners?: string[];
}

/** How the bundle came to be. Only the collection's publisher makes releases; others share the version they have. */
export type BundleKind = 'release' | 'share';

interface BundleRelease {
  kind: BundleKind;
  /** Shown to people installing or updating. */
  notes?: string;
}

/** manifest.json inside an exported collection zip. */
export interface CollectionBundleManifest {
  format: number;
  exportedAt: number;
  /** Carries `version`, `publisherId` and `author` of the exported release. */
  collection: CollectionMetadata;
  /** Missing in format 2 bundles, which are treated as releases without notes. */
  release?: BundleRelease;
  assets: Asset[];
  files: BundleFile[];
}

export const zipPathFor = (vaultPath: string): string => `${BUNDLE_FILES_DIR}/${vaultPath}`;

/** The uid names the collection's install record file. */
const SAFE_UID = /^[A-Za-z0-9-]{8,64}$/;

/** Asset ids end up in file names (`maps/<id>.json`), so they must not name another folder. */
const SAFE_ID = /^[^/\\.][^/\\]{0,127}$/;

/**
 * Whether a bundled vault path is safe to plan an import for: relative, without
 * `.`/`..` segments or hidden folders, and inside `atlas-vtt/` unless it is a
 * statblock note or artwork (which the importer copies into the collection).
 */
export function isSafeBundlePath(path: string, role: BundleFileRole): boolean {
  if (!path || path.length > 1024 || path.startsWith('/') || path.includes('\\')) return false;
  if ([...path].some((character) => character.charCodeAt(0) < 0x20)) return false;
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment.startsWith('.'))) return false;
  return segments[0] === 'atlas-vtt' || FOREIGN_FILE_ROLES.has(role);
}

const isBundleFile = (value: unknown): value is BundleFile =>
  isRecord(value)
  && typeof value.vaultPath === 'string'
  && typeof value.role === 'string'
  && (BUNDLE_FILE_ROLES as readonly string[]).includes(value.role)
  && (value.sha256 === undefined || (typeof value.sha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sha256)))
  && (value.owners === undefined || (Array.isArray(value.owners) && value.owners.every((owner) => typeof owner === 'string')));

const isBundleRelease = (value: unknown): value is BundleRelease =>
  isRecord(value)
  && (value.kind === 'release' || value.kind === 'share')
  && (value.notes === undefined || typeof value.notes === 'string');

/** Why a bundle cannot be imported, or null when its manifest is sound. */
export function manifestProblem(value: unknown): string | null {
  if (!isRecord(value) || typeof value.format !== 'number') return 'This file is not an Atlas collection export.';
  if (value.format > BUNDLE_FORMAT) return 'This collection was exported by a newer version of Atlas. Update Atlas to import it.';
  if (value.format < OLDEST_BUNDLE_FORMAT) return 'This collection export is too old to import.';
  const { collection, assets, files, release } = value;
  const isSound = typeof value.exportedAt === 'number'
    && isRecord(collection)
    && typeof collection.uid === 'string' && SAFE_UID.test(collection.uid)
    && typeof collection.name === 'string' && collection.name.trim() !== ''
    && typeof collection.id === 'string'
    && typeof collection.version === 'number' && Number.isInteger(collection.version) && collection.version >= 1
    && (release === undefined || isBundleRelease(release))
    && Array.isArray(assets)
    && assets.every((asset) => isRecord(asset) && typeof asset.id === 'string' && SAFE_ID.test(asset.id) && typeof asset.type === 'string')
    && Array.isArray(files)
    && files.every(isBundleFile);
  if (!isSound) return 'This collection export is damaged.';
  const unsafe = files.find((file) => !isSafeBundlePath(file.vaultPath, file.role));
  if (unsafe) return `This collection export contains a file Atlas will not write: ${unsafe.vaultPath}`;
  return null;
}
