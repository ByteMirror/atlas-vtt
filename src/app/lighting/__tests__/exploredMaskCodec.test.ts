import { describe, expect, it } from 'vitest';
import { exploredSaveSize, readExploredMask } from '../exploredMaskCodec';

describe('exploredSaveSize', () => {
  it('shrinks the longest side to 1024 pixels', () => {
    expect(exploredSaveSize({ width: 2048, height: 1024 })).toEqual({ width: 1024, height: 512 });
  });

  it('keeps small masks at their size', () => {
    expect(exploredSaveSize({ width: 300, height: 200 })).toEqual({ width: 300, height: 200 });
  });

  it('never rounds a side down to zero', () => {
    expect(exploredSaveSize({ width: 4000, height: 1 })).toEqual({ width: 1024, height: 1 });
  });
});

describe('readExploredMask', () => {
  it('accepts PNG data URLs', () => {
    expect(readExploredMask('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('rejects anything else a map file might hold', () => {
    expect(readExploredMask('javascript:alert(1)')).toBeNull();
    expect(readExploredMask('https://example.com/a.png')).toBeNull();
    expect(readExploredMask(42)).toBeNull();
    expect(readExploredMask(undefined)).toBeNull();
  });
});
