import { describe, expect, it } from 'vitest';
import { chordOffsets } from '../chordOffsets';

const share = (x: number): number => 0.5 + (x * Math.sqrt(1 - x * x) + Math.asin(x)) / Math.PI;

describe('chordOffsets', () => {
  it('splits the disc into strata of equal area, symmetric about its centre', () => {
    const offsets = chordOffsets(8);
    offsets.forEach((x, k) => expect(share(x)).toBeCloseTo((k + 0.5) / 8, 9));
    offsets.forEach((x, k) => expect(x).toBeCloseTo(-offsets[7 - k]!, 9));
  });
});
