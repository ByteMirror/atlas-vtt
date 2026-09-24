import type { AnyAsset, EncounterAsset, SortOption, SortOrder, Tab } from '../types';

export const SORT_LABELS: Record<SortOption, string> = {
  name: 'Name',
  date: 'Date modified',
  type: 'Type',
};

const ALL_SORT_OPTIONS: readonly SortOption[] = ['name', 'date', 'type'];
// Every scene is of one kind: the scene index does not record which map a scene shows.
const SCENE_SORT_OPTIONS: readonly SortOption[] = ['name', 'date'];

/** The sort options that order the assets of a tab, in the order the sort button cycles through them. */
export function sortOptionsFor(tab: Tab): readonly SortOption[] {
  return tab === 'scenes' ? SCENE_SORT_OPTIONS : ALL_SORT_OPTIONS;
}

/** The chosen sort option, or name where the option means nothing on the tab. */
export function resolveSortOption(requested: SortOption, tab: Tab): SortOption {
  return sortOptionsFor(tab).includes(requested) ? requested : 'name';
}

type AssetComparator = (a: AnyAsset, b: AnyAsset) => number;

// Numeric so "Goblin 2" sorts before "Goblin 10"; base sensitivity ignores case and accents.
const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const DIFFICULTY_RANK: Record<NonNullable<EncounterAsset['difficulty']>, number> = {
  easy: 0, medium: 1, hard: 2, deadly: 3,
};
const UNRANKED = Object.keys(DIFFICULTY_RANK).length;

function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
}

/**
 * Characters by size, then those with a linked statblock first; maps by file
 * format; encounters by difficulty.
 */
const compareKinds: AssetComparator = (a, b) => {
  if (a.type === 'tokens' && b.type === 'tokens') {
    return (a.size ?? 1) - (b.size ?? 1) || Number(!a.statblockPath) - Number(!b.statblockPath);
  }
  if (a.type === 'maps' && b.type === 'maps') {
    return nameCollator.compare(fileExtension(a.mapFilePath), fileExtension(b.mapFilePath));
  }
  if (a.type === 'encounters' && b.type === 'encounters') {
    const rank = (asset: EncounterAsset): number => (asset.difficulty ? DIFFICULTY_RANK[asset.difficulty] : UNRANKED);
    return rank(a) - rank(b);
  }
  return 0;
};

// The id settles equal names, so the order never depends on the order assets were loaded in.
const compareNames: AssetComparator = (a, b) =>
  nameCollator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const PRIMARY_COMPARATORS: Record<SortOption, AssetComparator> = {
  name: () => 0,
  date: (a, b) => a.modifiedAt - b.modifiedAt,
  type: compareKinds,
};

/** A sorted copy of `assets`; ties fall back to the name. Descending reverses the whole order. */
export function sortAssets(assets: readonly AnyAsset[], sortBy: SortOption, order: SortOrder): AnyAsset[] {
  const primary = PRIMARY_COMPARATORS[sortBy];
  const direction = order === 'asc' ? 1 : -1;
  return [...assets].sort((a, b) => direction * (primary(a, b) || compareNames(a, b)));
}
