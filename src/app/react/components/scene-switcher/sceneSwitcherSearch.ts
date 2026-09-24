import { prepareFuzzySearch, type SearchMatches } from 'obsidian';
import type { SceneTab } from '../../../types/sceneTabTypes';

/** Highest tab number that has a digit key. */
export const MAX_NUMBER_KEY = 9;

export interface SceneSwitcherResult {
  tab: SceneTab;
  /** 1-based position in the tab bar; stays the same while the list is filtered. */
  number: number;
  matches: SearchMatches;
}

export interface NameSegment {
  text: string;
  isMatch: boolean;
}

/** All tabs in tab-bar order for an empty query, otherwise fuzzy name matches with the best first. */
export function searchSceneTabs(tabs: readonly SceneTab[], query: string): SceneSwitcherResult[] {
  const trimmed = query.trim();
  if (!trimmed) return tabs.map((tab, index) => ({ tab, number: index + 1, matches: [] }));

  const search = prepareFuzzySearch(trimmed);
  return tabs
    .flatMap((tab, index) => {
      const result = search(tab.displayName);
      return result ? [{ tab, number: index + 1, matches: result.matches, score: result.score }] : [];
    })
    .sort((a, b) => b.score - a.score)
    .map(({ tab, number, matches }) => ({ tab, number, matches }));
}

/** Splits a name into matched and unmatched runs for highlighting. */
export function splitByMatches(text: string, matches: SearchMatches): NameSegment[] {
  const segments: NameSegment[] = [];
  let cursor = 0;
  for (const [start, end] of [...matches].sort((a, b) => a[0] - b[0])) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), isMatch: false });
    if (end > Math.max(start, cursor)) segments.push({ text: text.slice(Math.max(start, cursor), end), isMatch: true });
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMatch: false });
  return segments;
}
