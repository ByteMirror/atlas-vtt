import { COLLECTIONS_DIR, ATLAS_VTT_DIR } from '../AssetService';
import type { BundleFile } from './bundleFormat';
import { baseName } from '../../utils/pathUtils';

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
  const folder = file.role === 'statblock-note' || file.role === 'statblock-image' ? 'statblocks' : 'notes';
  return `${COLLECTIONS_DIR}/${collectionId}/${folder}`;
}

/** The file's own name in `folder`, or `goblin-2.png`, `goblin-3.png`, … when that name is taken. */
function freePathIn(folder: string, name: string, claimed: ReadonlySet<string>): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let path = `${folder}/${name}`;
  for (let n = 2; claimed.has(path); n++) path = `${folder}/${stem}-${n}${extension}`;
  return path;
}

/**
 * Decides the vault path every bundled file gets in the importing vault:
 * files of the source collection move to the target collection's folder,
 * global Atlas assets keep their path, and files from elsewhere in the source
 * vault (statblock notes and artwork) are kept where they are when the
 * importing vault already has them, otherwise copied into the collection.
 */
export function planImportPaths(
  files: readonly BundleFile[],
  sourceCollectionId: string,
  targetCollectionId: string,
  existsInVault: (path: string) => boolean,
  /** Vault paths already given to other files, e.g. by an earlier import of the collection. */
  alreadyClaimed: Iterable<string>,
): PathMap {
  const plan = new Map<string, string>();
  const claimed = new Set<string>(alreadyClaimed);
  const sourcePrefix = `${COLLECTIONS_DIR}/${sourceCollectionId}/`;

  for (const file of files) {
    let target: string;
    if (file.vaultPath.startsWith(sourcePrefix)) {
      target = `${COLLECTIONS_DIR}/${targetCollectionId}/${file.vaultPath.slice(sourcePrefix.length)}`;
    } else if (file.vaultPath.startsWith(`${ATLAS_VTT_DIR}/`) || existsInVault(file.vaultPath)) {
      target = file.vaultPath;
    } else {
      target = freePathIn(foreignFileFolder(file, targetCollectionId), baseName(file.vaultPath), claimed);
    }
    claimed.add(target);
    plan.set(file.vaultPath, target);
  }
  return plan;
}
