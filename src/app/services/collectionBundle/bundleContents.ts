import type { Asset } from '../AssetService';
import type { BundleFile, BundleFileRole } from './bundleFormat';
import { baseName } from '../../utils/pathUtils';

export type ContentCategory = 'scenes' | 'maps' | 'tokens' | 'encounters' | 'statblocks' | 'notes';

/** How a token looks when spawned, and the statblock it opens. Paths are the vault's when exporting and the bundle's when importing. */
export interface TokenPreview {
  imagePath: string;
  thumbnailPath?: string | undefined;
  showRing: boolean;
  statblockPath?: string | undefined;
}

/** One asset or note of a collection, keyed like the import plan's units: `asset:<id>` or `file:<vault path>`. */
export interface ContentItem {
  key: string;
  name: string;
  token?: TokenPreview | undefined;
}

export interface ContentGroup {
  category: ContentCategory;
  label: string;
  items: ContentItem[];
}

export const assetKey = (id: string): string => `asset:${id}`;
export const fileKey = (path: string): string => `file:${path}`;

/** Records of removed features (players, characters, statblock and note records) have no place here. */
const ASSET_CATEGORIES: Partial<Record<Asset['type'], ContentCategory>> = {
  scene: 'scenes', map: 'maps', token: 'tokens', encounter: 'encounters',
};

/** Files that stand for content of their own; every other file belongs to the assets that use it. */
const FILE_CATEGORIES: Partial<Record<BundleFileRole, ContentCategory>> = { 'statblock-note': 'statblocks', 'linked-note': 'notes' };

/** In display order; the ones people look for first are listed even when empty. */
const GROUPS: ReadonlyArray<{ category: ContentCategory; label: string; alwaysShown?: boolean }> = [
  { category: 'scenes', label: 'Scenes', alwaysShown: true },
  { category: 'maps', label: 'Maps', alwaysShown: true },
  { category: 'tokens', label: 'Tokens' },
  { category: 'encounters', label: 'Encounters' },
  { category: 'statblocks', label: 'Statblocks', alwaysShown: true },
  { category: 'notes', label: 'Notes', alwaysShown: true },
];

const noteName = (path: string): string => baseName(path).replace(/\.md$/i, '');
const byName = (a: ContentItem, b: ContentItem): number => a.name.localeCompare(b.name, undefined, { numeric: true });

/** What a collection holds, grouped the way people think of it: scenes, maps, tokens, …, statblocks and notes. */
export function groupContents(assets: readonly Asset[], files: readonly BundleFile[]): ContentGroup[] {
  const items = new Map<ContentCategory, ContentItem[]>();
  const add = (category: ContentCategory, item: ContentItem): void => {
    const list = items.get(category);
    if (list) list.push(item);
    else items.set(category, [item]);
  };
  for (const asset of assets) {
    const category = ASSET_CATEGORIES[asset.type];
    if (!category) continue;
    const item: ContentItem = { key: assetKey(asset.id), name: asset.name };
    if (asset.type === 'token') {
      item.token = { imagePath: asset.imagePath, thumbnailPath: asset.thumbnailPath, showRing: asset.showRing !== false, statblockPath: asset.statblockPath };
    }
    add(category, item);
  }
  for (const file of files) {
    const category = FILE_CATEGORIES[file.role];
    if (category) add(category, { key: fileKey(file.vaultPath), name: noteName(file.vaultPath) });
  }
  return GROUPS.flatMap(({ category, label, alwaysShown }): ContentGroup[] => {
    const grouped = (items.get(category) ?? []).sort(byName);
    return grouped.length > 0 || alwaysShown ? [{ category, label, items: grouped }] : [];
  });
}

export interface SelectedContent {
  assets: Asset[];
  files: BundleFile[];
}

/**
 * What an export packs once the user left out `excluded` content: the
 * remaining assets, and the files still used by one of them. Statblock artwork
 * goes with the notes that show it; every other file with the assets that own it.
 */
export function selectContent(assets: readonly Asset[], files: readonly BundleFile[], excluded: ReadonlySet<string>): SelectedContent {
  const kept = assets.filter((asset) => !excluded.has(assetKey(asset.id)));
  const keptIds = new Set(kept.map((asset) => asset.id));
  const candidates = files.filter((file) => !excluded.has(fileKey(file.vaultPath))
    && (!file.owners?.length || file.owners.some((owner) => keptIds.has(owner))));
  const shownArtwork = new Set(candidates.flatMap((file) => (file.statblockImage ? [file.statblockImage.path] : [])));
  return {
    assets: kept,
    files: candidates
      .filter((file) => file.role !== 'statblock-image' || shownArtwork.has(file.vaultPath))
      .map((file) => (file.owners ? { ...file, owners: file.owners.filter((owner) => keptIds.has(owner)) } : file)),
  };
}

/** The content keys of everything `selectContent` kept. */
export function selectedKeys({ assets, files }: SelectedContent): Set<string> {
  return new Set([...assets.map((asset) => assetKey(asset.id)), ...files.map((file) => fileKey(file.vaultPath))]);
}
