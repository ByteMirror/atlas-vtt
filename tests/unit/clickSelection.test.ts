import { describe, expect, it } from 'vitest';
import { applyClickSelection } from '../../src/app/packages/components/asset-manager/utils/clickSelection';

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
