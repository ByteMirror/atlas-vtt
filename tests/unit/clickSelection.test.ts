import { describe, expect, it } from 'vitest';
import { applyClickSelection, resolveSelectAll } from '../../src/app/packages/components/asset-manager/utils/clickSelection';

const orderedIds = ['a', 'b', 'c', 'd', 'e'];
const click = (mods: Partial<MouseEvent> = {}): MouseEvent => ({ shiftKey: false, ctrlKey: false, metaKey: false, ...mods }) as MouseEvent;

describe('applyClickSelection', () => {
  it('plain click selects only the item and moves the anchor', () => {
    expect(applyClickSelection({ selected: ['a', 'b'], orderedIds, id: 'd', anchorId: 'a', event: click() }))
      .toEqual({ selected: ['d'], anchorId: 'd' });
  });

  it('ctrl and cmd click toggle the item', () => {
    expect(applyClickSelection({ selected: ['a'], orderedIds, id: 'c', anchorId: 'a', event: click({ ctrlKey: true }) }).selected)
      .toEqual(['a', 'c']);
    expect(applyClickSelection({ selected: ['a', 'c'], orderedIds, id: 'c', anchorId: 'a', event: click({ metaKey: true }) }).selected)
      .toEqual(['a']);
  });

  it('checkbox toggle works without modifiers', () => {
    expect(applyClickSelection({ selected: ['a'], orderedIds, id: 'b', anchorId: 'a', toggle: true }).selected).toEqual(['a', 'b']);
  });

  it('shift click spans from the anchor in either direction and keeps the anchor', () => {
    expect(applyClickSelection({ selected: ['b'], orderedIds, id: 'd', anchorId: 'b', event: click({ shiftKey: true }) }))
      .toEqual({ selected: ['b', 'c', 'd'], anchorId: 'b' });
    expect(applyClickSelection({ selected: ['d', 'e'], orderedIds, id: 'b', anchorId: 'd', event: click({ shiftKey: true }) }).selected)
      .toEqual(['d', 'e', 'b', 'c']);
  });

  it('shift click without a visible anchor falls back to a plain select', () => {
    expect(applyClickSelection({ selected: ['a'], orderedIds, id: 'c', anchorId: 'gone', event: click({ shiftKey: true }) }))
      .toEqual({ selected: ['c'], anchorId: 'c' });
  });
});

describe('resolveSelectAll', () => {
  const visible = { assets: ['t1', 't2'], folders: ['f1', 'f2'] };

  it('selects all assets when nothing is selected', () => {
    expect(resolveSelectAll({ visible, selectedAssetIds: [], selectedFolderIds: [] })).toEqual({ assets: ['t1', 't2'], folders: [] });
  });

  it('selects all assets when an asset is selected', () => {
    expect(resolveSelectAll({ visible, selectedAssetIds: ['t2'], selectedFolderIds: [] })).toEqual({ assets: ['t1', 't2'], folders: [] });
  });

  it('selects all folders when a folder is selected', () => {
    expect(resolveSelectAll({ visible, selectedAssetIds: [], selectedFolderIds: ['f1'] })).toEqual({ assets: [], folders: ['f1', 'f2'] });
  });

  it('falls back to folders when the view has no assets', () => {
    expect(resolveSelectAll({ visible: { assets: [], folders: ['f1'] }, selectedAssetIds: [], selectedFolderIds: [] })).toEqual({ assets: [], folders: ['f1'] });
  });

  it('selects the visible assets when the selection holds other, filtered-out assets', () => {
    expect(resolveSelectAll({ visible, selectedAssetIds: ['t9', 't8'], selectedFolderIds: [] })).toEqual({ assets: ['t1', 't2'], folders: [] });
  });

  it('clears the list when it is already fully selected', () => {
    expect(resolveSelectAll({ visible, selectedAssetIds: ['t1', 't2'], selectedFolderIds: [] })).toEqual({ assets: [], folders: [] });
  });
});
