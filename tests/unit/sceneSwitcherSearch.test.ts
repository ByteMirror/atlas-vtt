import { describe, expect, it } from 'vitest';
import { searchSceneTabs, splitByMatches } from '../../src/app/react/components/scene-switcher/sceneSwitcherSearch';
import type { SceneTab } from '../../src/app/types/sceneTabTypes';

const tab = (id: string, displayName: string): SceneTab => ({ id, filePath: `${displayName}.atlasmap`, displayName, isLoaded: true, isDirty: false });
const tabs = [tab('a', 'Tavern'), tab('b', 'Crystal Caves'), tab('c', 'Cave Entrance')];

describe('scene switcher search', () => {
  it('lists every tab in tab-bar order for an empty query', () => {
    expect(searchSceneTabs(tabs, '  ').map(r => [r.tab.id, r.number])).toEqual([['a', 1], ['b', 2], ['c', 3]]);
  });
  it('filters by fuzzy name match, best first, keeping tab-bar numbers', () => {
    const results = searchSceneTabs(tabs, 'cave');
    expect(results.map(r => [r.tab.id, r.number])).toEqual([['c', 3], ['b', 2]]);
    expect(searchSceneTabs(tabs, 'dragon')).toEqual([]);
  });
  it('splits names into matched and unmatched runs', () => {
    expect(splitByMatches('Crystal Caves', [[8, 12], [0, 1]])).toEqual([
      { text: 'C', isMatch: true },
      { text: 'rystal ', isMatch: false },
      { text: 'Cave', isMatch: true },
      { text: 's', isMatch: false },
    ]);
  });
});
