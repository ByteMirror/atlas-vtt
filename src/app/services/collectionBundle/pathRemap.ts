import { COLLECTIONS_DIR, ATLAS_VTT_DIR, GLOBAL_ASSETS_DIR } from '../AssetService';

const GLOBAL_ASSETS_PREFIX = `${GLOBAL_ASSETS_DIR}/`;
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

/** Where a file without a place of its own in the target collection is copied to, by what it is. */
function copyFolder(file: BundleFile, collectionId: string): string {
  const folder = REUSABLE_FILE_ROLES.has(file.role) ? 'statblocks' : file.vaultPath.endsWith('.md') ? 'notes' : 'files';
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
  /**
   * Vault paths the collection's install record gives its files. With a record,
   * any other file in the collection's folder is the user's own; without one
   * (copies from before install records), the folder's files are the earlier install.
   */
  recordTargets: ReadonlySet<string> | null;
}

/**
 * Decides the vault path every bundled file gets in the importing vault, so
 * that no two files share a target and no file the user owns is taken over.
 * Files with a fixed place come first: the source collection's files move to
 * the target collection's folder, shared artwork in `atlas-vtt/assets/` keeps
 * its path when that is free or holds the same content, and statblock notes
 * and artwork the vault already has are reused where they are. Everything else
 * is copied into the collection under a free name.
 */
export function planImportPaths(files: readonly BundleFile[], rules: ImportPathRules): PathMap {
  const plan = new Map<string, string>();
  const claimed = new Set<string>(rules.recordTargets ?? []);
  const sourcePrefix = `${COLLECTIONS_DIR}/${rules.sourceCollectionId}/`;
  const targetPrefix = `${COLLECTIONS_DIR}/${rules.targetCollectionId}/`;
  const isUsersFile = (path: string): boolean => rules.existsInVault(path) && !rules.recordTargets?.has(path)
    && (rules.recordTargets !== null || !path.startsWith(targetPrefix));
  const isTaken = (path: string): boolean => claimed.has(path) || isUsersFile(path);
  const place = (file: BundleFile, target: string): void => {
    claimed.add(target);
    plan.set(file.vaultPath, target);
  };

  const unplaced: Array<{ file: BundleFile; folder: string }> = [];
  for (const file of files) {
    const path = file.vaultPath;
    if (path.startsWith(sourcePrefix)) {
      const target = `${targetPrefix}${path.slice(sourcePrefix.length)}`;
      if (isUsersFile(target)) unplaced.push({ file, folder: parentPath(target) });
      else place(file, target);
    } else if (path.startsWith(GLOBAL_ASSETS_PREFIX)) {
      if (!rules.existsInVault(path) || rules.hasSameContent(file)) place(file, path);
      else unplaced.push({ file, folder: parentPath(path) });
    } else if (REUSABLE_FILE_ROLES.has(file.role) && !path.startsWith(`${ATLAS_VTT_DIR}/`) && rules.existsInVault(path)) {
      place(file, path);
    } else {
      unplaced.push({ file, folder: copyFolder(file, rules.targetCollectionId) });
    }
  }
  for (const { file, folder } of unplaced) place(file, freePathIn(folder, baseName(file.vaultPath), isTaken));
  return plan;
}
