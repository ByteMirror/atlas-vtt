import { describe, expect, it } from 'vitest';
import { filterAssets, filterFolders, type AssetFilter } from '../../src/app/packages/components/asset-manager/utils/assetFilter';
import type { AnyAsset, Folder, TokenAsset } from '../../src/app/packages/components/asset-manager/types';

const token = (name: string, folderId: string | null, tags: string[] = []): TokenAsset => ({
  id: name, name, type: 'tokens', imageUrl: '', modifiedAt: 0, folderId, tags,
});
const folder = (id: string, parentId: string | null): Folder => ({ id, name: id, type: 'tokens', parentId, path: id });
const names = (assets: AnyAsset[]): string[] => assets.map((asset) => asset.name);

// root ─ Goblin
//  ├ monsters ─ Wolf
//  │  └ undead ─ Ghoul
//  └ npcs ─ Innkeeper
const folders = [folder('monsters', null), folder('undead', 'monsters'), folder('npcs', null)];
const assets = [
  token('Goblin', null, ['Forest']),
  token('Wolf', 'monsters', ['Forest', 'Beast']),
  token('Ghoul', 'undead', ['forest-id']),
  token('Innkeeper', 'npcs'),
];
const forest = { id: 'forest-id', name: 'Forest' };
const filter = (overrides: Partial<AssetFilter>): AssetFilter => ({ tab: 'tokens', folderId: null, search: '', tags: [], ...overrides });

describe('filterAssets', () => {
  it('lists only the open folder while no tag is selected', () => {
    expect(names(filterAssets(assets, folders, filter({})))).toEqual(['Goblin']);
    expect(names(filterAssets(assets, folders, filter({ folderId: 'monsters' })))).toEqual(['Wolf']);
  });

  it('finds tagged assets in every folder from the root', () => {
    expect(names(filterAssets(assets, folders, filter({ tags: [forest] })))).toEqual(['Goblin', 'Wolf', 'Ghoul']);
  });

  it('finds tagged assets in every subfolder of the open folder', () => {
    expect(names(filterAssets(assets, folders, filter({ folderId: 'monsters', tags: [forest] })))).toEqual(['Wolf', 'Ghoul']);
  });

  it('searches every folder from the root and every subfolder of the open folder', () => {
    expect(names(filterAssets(assets, folders, filter({ search: 'o' })))).toEqual(['Goblin', 'Wolf', 'Ghoul']);
    expect(names(filterAssets(assets, folders, filter({ folderId: 'monsters', search: 'o' })))).toEqual(['Wolf', 'Ghoul']);
  });

  it('requires every selected tag and the search', () => {
    expect(names(filterAssets(assets, folders, filter({ tags: [forest, { id: 'beast', name: 'Beast' }] })))).toEqual(['Wolf']);
    expect(names(filterAssets(assets, folders, filter({ tags: [forest], search: 'gh' })))).toEqual(['Ghoul']);
  });

  it('survives folders whose parents form a cycle', () => {
    const cyclic = [folder('a', 'b'), folder('b', 'a')];
    expect(names(filterAssets([token('Loop', 'b', ['Forest'])], cyclic, filter({ folderId: 'a', tags: [forest] })))).toEqual(['Loop']);
  });
});

describe('filterFolders', () => {
  it('shows the open folder\'s subfolders and hides them while a search or tag filters', () => {
    expect(filterFolders(folders, filter({})).map((f) => f.id)).toEqual(['monsters', 'npcs']);
    expect(filterFolders(folders, filter({ tags: [forest] }))).toEqual([]);
    expect(filterFolders(folders, filter({ search: 'wolf' }))).toEqual([]);
  });
});
