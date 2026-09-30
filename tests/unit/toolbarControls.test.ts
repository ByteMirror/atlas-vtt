import { describe, expect, it } from 'vitest';
import { isToolbarControlShown, movedToolbarOrder, orderedToolbarIds, readToolbarControlOverrides, readToolbarOrder, withToolbarControl } from '../../src/app/settings/toolbarControls';

describe('toolbar controls', () => {
  it('shows controls by default', () => {
    expect(isToolbarControlShown({}, 'fog')).toBe(true);
    expect(isToolbarControlShown(undefined, 'pin')).toBe(true);
  });

  it('keeps only overrides that differ from the default', () => {
    const hidden = withToolbarControl({}, 'fog', false);
    expect(hidden).toEqual({ fog: false });
    expect(isToolbarControlShown(hidden, 'fog')).toBe(false);
    expect(withToolbarControl(hidden, 'fog', true)).toEqual({});
    expect(withToolbarControl({ pin: false }, 'fog', false)).toEqual({ pin: false, fog: false });
  });

  it('ignores unknown ids and non-boolean values in a stored file', () => {
    expect(readToolbarControlOverrides({ fog: false, bogus: false, draw: 'no', move: false })).toEqual({ fog: false });
    expect(readToolbarControlOverrides(['fog'])).toEqual({});
    expect(readToolbarControlOverrides(null)).toEqual({});
  });

  it('ignores a stored override for a control that cannot be hidden', () => {
    expect(readToolbarControlOverrides({ move: false, dice: false })).toEqual({});
  });
});

describe('toolbar order', () => {
  const defaults = ['move', 'fog', 'draw', 'pin', 'dice'];

  it('is the default order when the user has not chosen one', () => {
    expect(orderedToolbarIds(defaults, [])).toEqual(defaults);
  });

  it('applies the user order, dropping unknown and repeated ids', () => {
    expect(orderedToolbarIds(defaults, ['dice', 'bogus', 'move', 'dice', 'fog', 'draw', 'pin'])).toEqual(['dice', 'move', 'fog', 'draw', 'pin']);
  });

  it('puts a control the user has not placed after the one that precedes it by default', () => {
    expect(orderedToolbarIds(defaults, ['dice', 'move', 'draw', 'fog'])).toEqual(['dice', 'move', 'draw', 'pin', 'fog']);
    expect(orderedToolbarIds(defaults, ['fog', 'move'])).toEqual(['fog', 'draw', 'pin', 'dice', 'move']);
  });

  it('moves a control one place and stops at the ends', () => {
    expect(movedToolbarOrder(defaults, 1, 1)).toEqual(['move', 'draw', 'fog', 'pin', 'dice']);
    expect(movedToolbarOrder(defaults, 0, -1)).toEqual(defaults);
    expect(movedToolbarOrder(defaults, 4, 1)).toEqual(defaults);
  });

  it('reads only strings from a stored order', () => {
    expect(readToolbarOrder(['fog', 3, 'fog', 'move'])).toEqual(['fog', 'move']);
    expect(readToolbarOrder('fog')).toEqual([]);
  });
});
