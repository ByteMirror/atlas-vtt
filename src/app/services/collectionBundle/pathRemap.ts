import { COLLECTIONS_DIR, ATLAS_VTT_DIR } from '../AssetService';
import { REUSABLE_FILE_ROLES, type BundleFile } from './bundleFormat';
import { baseName, parentPath } from '../../utils/pathUtils';

export type PathMap = ReadonlyMap<string, string>;

/**
 * Returns `value` with every string that exactly equals a known vault path
 * replaced by its new path. Works on asset records, scene JSON and whole
 * `.atlasmap` files alike, since all of them store paths as plain strings.
 */
export function remapPaths<T>(value: T, map: PathMap): T {
  if (typeof value === 'string') return (map.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item: unknown) => remapPaths(item, map)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = remapPaths(item, map);
    return out as T;
  }
  return value;
}

/** Where a file from outside `atlas-vtt/` is copied to, by what it is. */
function foreignFileFolder(file: BundleFile, collectionId: string): string {
  const folder = REUSABLE_FILE_ROLES.has(file.role) ? 'statblocks' : 'notes';
  return `${COLLECTIONS_DIR}/${collectionId}/${folder}`;
}

/** The file's own name in `folder`, or `goblin-2.png`, `goblin-3.png`, … while that name is taken. */
function freePathIn(folder: string, name: string, isTaken: (path: string) => boolean): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let path = `${folder}/${name}`;
  for (let n = 2; isTaken(path); n++) path = `${folder}/${stem}-${n}${extension}`;
  return path;
}

export interface ImportPathRules {
  sourceCollectionId: string;
  targetCollectionId: string;
  existsInVault(path: string): boolean;
  /** Whether the vault's file at the bundle file's own path has the same content, so it can be shared. */
  hasSameContent(file: BundleFile): boolean;
  /** Vault paths already given to other files, e.g. by an earlier import of the collection. */
  claimed: Iterable<string>;
}

/**
 * Decides the vault path every bundled file gets in the importing vault. Files
 * with a fixed place come first: the source collection's files move to the
 * target collection's folder, other Atlas files keep their path when it is
 * free or holds the same content, and statblock notes and artwork the vault
 * already has are reused where they are. Every other file is copied to a free
 * path that no other file and nothing in the vault uses, so no two files ever
 * share a target and no existing file is taken over.
 */
export function planImportPaths(files: readonly BundleFile[], rules: ImportPathRules): PathMap {
  const plan = new Map<string, string>();
  const claimed = new Set<string>(rules.claimed);
  const sourcePrefix = `${COLLECTIONS_DIR}/${rules.sourceCollectionId}/`;
  const targetPrefix = `${COLLECTIONS_DIR}/${rules.targetCollectionId}/`;
  // The collection's own folder holds its earlier installs; everywhere else an existing file belongs to someone else.
  const isTaken = (path: string): boolean => claimed.has(path) || (!path.startsWith(targetPrefix) && rules.existsInVault(path));
  const place = (file: BundleFile, target: string): void => {
    claimed.add(target);
    plan.set(file.vaultPath, target);
  };

  const unplaced: BundleFile[] = [];
  for (const file of files) {
    const path = file.vaultPath;
    if (path.startsWith(sourcePrefix)) place(file, `${targetPrefix}${path.slice(sourcePrefix.length)}`);
    else if (path.startsWith(`${ATLAS_VTT_DIR}/`) && (!rules.existsInVault(path) || rules.hasSameContent(file))) place(file, path);
    else if (REUSABLE_FILE_ROLES.has(file.role) && rules.existsInVault(path)) place(file, path);
    else unplaced.push(file);
  }
  for (const file of unplaced) {
    const folder = file.vaultPath.startsWith(`${ATLAS_VTT_DIR}/`) ? parentPath(file.vaultPath) : foreignFileFolder(file, rules.targetCollectionId);
    place(file, freePathIn(folder, baseName(file.vaultPath), isTaken));
  }
  return plan;
}
