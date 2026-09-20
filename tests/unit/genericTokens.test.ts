import { describe, it, expect } from 'vitest';
import {
  colorForLabel,
  fileNameForLabel,
  GENERIC_TOKEN_LABELS,
} from '../../src/app/services/GenericTokenService';

describe('generic token labels', () => {
  it('colours enemy slots differently from players', () => {
    expect(colorForLabel('E1')).not.toBe(colorForLabel('P1'));
    expect(colorForLabel('e9')).toBe(colorForLabel('E1'));
  });

  it('treats named characters as players', () => {
    expect(colorForLabel('Basti')).toBe(colorForLabel('P1'));
    // "Edgar" starts with E but is not an enemy slot
    expect(colorForLabel('Edgar')).toBe(colorForLabel('P1'));
  });

  it('produces safe, unique filenames', () => {
    expect(fileNameForLabel('P1')).toBe('generic-p1.webp');
    expect(fileNameForLabel('Basti')).toBe('generic-basti.webp');
    const names = GENERIC_TOKEN_LABELS.map(fileNameForLabel);
    expect(new Set(names).size).toBe(names.length);
  });
});
