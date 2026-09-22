import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCallback } from '../../src/app/react/components/statblock/layoutCallbacks';

describe('runCallback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes args to the callback as named parameters', () => {
    const result = runCallback('return `${property.name} +${monster.bonus}`;', {
      monster: { bonus: 3 },
      property: { name: 'Dex' },
    }, '');

    expect(result).toBe('Dex +3');
  });

  it('returns the fallback without compiling anything when there is no code', () => {
    expect(runCallback(undefined, { monster: {} }, 'fallback')).toBe('fallback');
    expect(runCallback('', { monster: {} }, 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the callback yields a nullish value', () => {
    expect(runCallback<string | null>('return null;', {}, 'fallback')).toBe('fallback');
    expect(runCallback('monster.touched = true;', { monster: {} }, 'fallback')).toBe('fallback');
  });

  it('keeps falsy but non-nullish results', () => {
    expect(runCallback('return 0;', {}, 5)).toBe(0);
    expect(runCallback('return false;', {}, true)).toBe(false);
  });

  it('degrades to the fallback when the callback throws or does not compile', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(runCallback('throw new Error("boom");', {}, 'fallback')).toBe('fallback');
    expect(runCallback('return (;', {}, 'fallback')).toBe('fallback');
    expect(error).toHaveBeenCalledTimes(2);
  });
});
