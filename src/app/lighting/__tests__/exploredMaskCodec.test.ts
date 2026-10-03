import { describe, expect, it } from 'vitest';
import { readExploredMask } from '../exploredMaskCodec';

describe('readExploredMask', () => {
  it('takes a PNG data URL and nothing else: map files arrive unchecked', () => {
    const mask = 'data:image/png;base64,iVBORw0KGgo=';
    expect(readExploredMask(mask)).toBe(mask);
    for (const other of ['data:image/jpeg;base64,AAAA', 'https://example.com/mask.png', 'data:image/png;base64,<script>', '', 5, null, undefined, { src: mask }]) expect(readExploredMask(other)).toBeNull();
  });
});
