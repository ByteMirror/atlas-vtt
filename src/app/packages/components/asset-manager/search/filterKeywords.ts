import { parseRating } from '../../../../creatures/creatureValues';
import type { CreatureFacets } from '../../../../creatures/creatureFilterEngine';
import type { CreatureFilterDefinition, NumericRange } from '../../../../types/creatureFilterTypes';
import type { QueryKeyword } from '../../../../search/querySyntax';
import type { Tab } from '../types';
import { t } from '../../../../i18n';

/** A keyword of the asset search and what it filters. */
export type FilterKeyword = QueryKeyword & (
  | { kind: 'name' | 'tag' | 'statblock' | 'layout' }
  | { kind: 'range' | 'options'; filterId: string }
);

/** Prefixes of Atlas' own creature filters, by filter id: short, and the way people type them. */
const CATALOG_PREFIXES: Readonly<Record<string, { prefix: string; aliases: string[] }>> = {
  cr: { prefix: 'cr', aliases: ['challenge'] },
  level: { prefix: 'level', aliases: ['lvl', 'lv'] },
  tier: { prefix: 'tier', aliases: [] },
  type: { prefix: 'type', aliases: ['t'] },
  traits: { prefix: 'trait', aliases: ['traits'] },
  rarity: { prefix: 'rarity', aliases: ['rar'] },
  alignment: { prefix: 'alignment', aliases: ['al', 'align'] },
  source: { prefix: 'source', aliases: ['src'] },
};

const STATBLOCK_VALUES: Readonly<Record<string, 'any' | 'linked' | 'unlinked'>> = {
  yes: 'linked', with: 'linked', linked: 'linked',
  no: 'unlinked', without: 'unlinked', unlinked: 'unlinked',
  any: 'any', all: 'any',
};

/** A statblock filter as typed (`statblock:yes`), or null. */
export function statblockValue(value: string): 'any' | 'linked' | 'unlinked' | null {
  return STATBLOCK_VALUES[value.toLowerCase()] ?? null;
}

/** Bounds as typed: one value (`1/4`) or a range (`1-3`, `1..3`, `1/4–2`). */
export function rangeValue(value: string): NumericRange | null {
  const range = /^(.+?)(?:\.\.|–|-)(.+)$/.exec(value);
  const parts = range && range[1] ? [range[1], range[2]!] : [value];
  const bounds = parts.map(parseRating);
  if (bounds.some((bound) => bound === null)) return null;
  const [min, max = min] = bounds as number[];
  return { min: Math.min(min!, max!), max: Math.max(min!, max!) };
}

const PREFIX_PATTERN = /^[a-z][a-z0-9_-]*$/;

function creatureKeyword(definition: CreatureFilterDefinition, taken: Set<string>): FilterKeyword | null {
  const names = CATALOG_PREFIXES[definition.id] ?? { prefix: definition.id, aliases: [] };
  if (!PREFIX_PATTERN.test(names.prefix) || taken.has(names.prefix)) return null;
  const aliases = names.aliases.filter((alias) => !taken.has(alias));
  for (const name of [names.prefix, ...aliases]) taken.add(name);
  return definition.kind === 'range'
    ? {
      kind: 'range', filterId: definition.id, prefix: names.prefix, aliases, numeric: true,
      description: t('filters.keyword.range', { label: definition.label, example1: `${names.prefix}:1-3`, example2: `${names.prefix}>=5` }),
      accepts: (value) => rangeValue(value) !== null,
    }
    : { kind: 'options', filterId: definition.id, prefix: names.prefix, aliases, numeric: false, negatable: true, description: definition.label };
}

/** The keywords the search of a tab understands: name and tag everywhere, statblock fields on the Characters tab. */
export function filterKeywords(tab: Tab, definitions: readonly CreatureFilterDefinition[]): FilterKeyword[] {
  const keywords: FilterKeyword[] = [
    { kind: 'name', prefix: 'name', aliases: ['n'], numeric: false, description: t('filters.keyword.name') },
    { kind: 'tag', prefix: 'tag', aliases: ['tags'], numeric: false, description: t('filters.tag') },
  ];
  if (tab !== 'tokens') return keywords;
  keywords.push(
    { kind: 'statblock', prefix: 'statblock', aliases: ['sb'], numeric: false, description: t('filters.keyword.statblock'), accepts: (value) => statblockValue(value) !== null },
    { kind: 'layout', prefix: 'layout', aliases: [], numeric: false, negatable: true, description: t('filters.keyword.layout') },
  );
  const taken = new Set(keywords.flatMap((keyword) => [keyword.prefix, ...keyword.aliases]));
  for (const definition of definitions) {
    const keyword = creatureKeyword(definition, taken);
    if (keyword) keywords.push(keyword);
  }
  return keywords;
}

/** The keywords worth suggesting: those whose values the assets in view have. */
export function suggestedKeywords(keywords: readonly FilterKeyword[], facets: CreatureFacets | null, hasTags: boolean): FilterKeyword[] {
  return keywords.filter((keyword) => {
    switch (keyword.kind) {
      case 'tag': return hasTags;
      case 'layout': return (facets?.layouts.length ?? 0) > 1;
      case 'range': return facets?.ranges.some((facet) => facet.definition.id === keyword.filterId && facet.values.length > 0) ?? false;
      case 'options': return facets?.options.some((facet) => facet.definition.id === keyword.filterId && facet.options.length > 0) ?? false;
      default: return true;
    }
  });
}
