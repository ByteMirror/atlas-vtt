import { describe, expect, it } from 'vitest';
import { baseViewNames, LOOT_QUERY_VIEW, lootQueryConfig, wholeBaseQueryConfig } from '../../src/app/loot/lootBaseQuery';
import { roleProperties, toLootItems, type LootQuerySnapshot } from '../../src/app/loot/lootItem';

const BASE = {
  filters: { and: ['file.inFolder("Items")'] },
  formulas: { cost: 'price * 2' },
  properties: { 'note.price': { displayName: 'Price' } },
  views: [
    { type: 'table', name: 'Weapons', filters: { and: ['type == "Weapon"'] }, order: ['file.name', 'note.damage'] },
    { type: 'cards', name: 'Armor' },
    { type: 'table' },
  ],
};

describe('reading a base', () => {
  it('lists the views that have a name', () => {
    expect(baseViewNames(BASE)).toEqual(['Weapons', 'Armor']);
    expect(baseViewNames('not a base')).toEqual([]);
    expect(baseViewNames({ views: 'Weapons' })).toEqual([]);
  });

  it('runs one view with Atlas’s view type and the base’s own filters, formulas and properties', () => {
    expect(lootQueryConfig(BASE, 'Weapons')).toEqual({
      filters: BASE.filters,
      formulas: BASE.formulas,
      properties: BASE.properties,
      views: [{ type: LOOT_QUERY_VIEW, name: 'Weapons', filters: { and: ['type == "Weapon"'] }, order: ['file.name', 'note.damage'] }],
    });
  });

  it('has no query for a view the base does not have', () => {
    expect(lootQueryConfig(BASE, 'Rings')).toBeNull();
    expect(lootQueryConfig({ views: [{ name: 'Only' }] }, 'Only')).toEqual({ views: [{ name: 'Only', type: LOOT_QUERY_VIEW }] });
  });

  it('lists everything a base holds by its own filters, and nothing for a base that filters nothing itself', () => {
    const filters = { and: ['file.inFolder("Items")'] };
    expect(wholeBaseQueryConfig({ filters, views: [{ name: 'Weapons', filters: { and: ['type == "Weapon"'] } }] }))
      .toEqual({ filters, views: [{ name: LOOT_QUERY_VIEW, type: LOOT_QUERY_VIEW }] });
    // Such a base would list the whole vault.
    for (const base of [{ views: [{ name: 'Weapons' }] }, { filters: { and: [] } }, { filters: { or: [{ and: [' '] }] } }, null]) {
      expect(wholeBaseQueryConfig(base)).toBeNull();
    }
  });
});

describe('items of a base view', () => {
  const snapshot: LootQuerySnapshot = {
    order: ['file.name', 'note.type', 'note.damage', 'note.price', 'note.source', 'note.feature'],
    displayNames: { 'note.damage': 'Damage', 'note.feature': 'Feature' },
    entries: [
      {
        path: 'Items/Broadsword.md',
        name: 'Broadsword',
        values: {
          'file.name': 'Broadsword',
          'note.type': 'Primary Weapon',
          'note.damage': 'd8 phy',
          'note.price': '100',
          'note.source': '[[Core]]',
          'note.feature': 'Reliable',
          'note.rarity': 'Common',
        },
      },
      { path: 'Items/Rope.md', name: 'Rope', values: { 'file.name': 'Rope' } },
    ],
  };

  it('finds price, rarity, type and description by property name', () => {
    expect(roleProperties(['file.name', 'note.Cost', 'note.quality', 'note.kind', 'note.effect'])).toEqual({
      price: 'note.Cost',
      rarity: 'note.quality',
      type: 'note.kind',
      description: 'note.effect',
    });
  });

  it('shows the view’s other columns as properties, under the base’s names', () => {
    const [sword, rope] = toLootItems(snapshot, ['Items', 'Weapons']);
    expect(sword).toEqual({
      id: 'Items/Broadsword.md',
      name: 'Broadsword',
      source: ['Items', 'Weapons'],
      price: '100',
      rarity: 'Common',
      type: 'Primary Weapon',
      description: 'Reliable',
      properties: [{ label: 'Damage', value: 'd8 phy' }],
    });
    expect(rope).toEqual({ id: 'Items/Rope.md', name: 'Rope', source: ['Items', 'Weapons'], properties: [] });
  });
});
