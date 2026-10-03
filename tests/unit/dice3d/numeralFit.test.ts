import { describe, expect, it } from 'vitest';
import { dieGeometry, faceIndexForValue, type DieSides } from '../../../src/app/dice3d/dieGeometry';
import { faceOutline } from '../../../src/app/dice3d/faceFrame';
import { fitNumeral } from '../../../src/app/dice3d/numeralFit';

const CELL = 256;
/** Ink bounds of the numeral sheet's cells (1 to 20, underlined 6 and 9), measured from `numerals.webp`. */
const INK = [[58, 30, 99, 133], [44, 30, 118, 131], [53, 30, 109, 131], [46, 29, 117, 128], [48, 31, 115, 126], [46, 30, 114, 127], [49, 29, 111, 128], [49, 31, 112, 127], [46, 31, 115, 128], [32, 35, 131, 122], [45, 29, 114, 128], [31, 30, 129, 125], [39, 29, 123, 129], [31, 30, 132, 126], [32, 30, 130, 128], [32, 34, 131, 123], [32, 31, 129, 127], [35, 29, 126, 128], [40, 29, 123, 130], [32, 48, 132, 110], [46, 29, 116, 147], [44, 30, 116, 147]] as const;
const NOMINAL = (sides: number): number => (sides >= 12 ? 0.36 : 0.44) * CELL / 0.6 / 160;

function inkOf(sides: number, value: number): readonly number[] {
  const underlined = sides >= 10 && (value === 6 || value === 9);
  return INK[underlined ? (value === 6 ? 20 : 21) : value - 1]!;
}

/** Whether every corner of the box lies inside the convex outline. */
function inside(outline: [number, number][], corners: [number, number][]): boolean {
  return outline.every((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const sign = Math.sign((b[0] - a[0]) * (0 - a[1]) - (b[1] - a[1]) * (0 - a[0]));
    return corners.every(([x, y]) => Math.sign((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])) === sign);
  });
}

describe('fitNumeral', () => {
  // The d4 writes its numbers at the corners of its faces: `faceMarks.test.ts`.
  for (const sides of [6, 8, 10, 12, 20] as DieSides[]) {
    it(`keeps every numeral of the d${sides} inside its face`, () => {
      const geometry = dieGeometry(sides);
      for (const value of geometry.values) {
        const outline = faceOutline(geometry, faceIndexForValue(geometry, value), CELL);
        const [x0, y0, x1, y1] = inkOf(sides, value);
        const w = (x1! - x0!) * NOMINAL(sides);
        const h = (y1! - y0!) * NOMINAL(sides);
        const scale = fitNumeral(outline, w, h);
        expect(scale).toBeLessThanOrEqual(1);
        // Centred on the face centre: no numeral sits lower or higher on its face than another.
        const hw = (w * scale) / 2;
        const hh = (h * scale) / 2;
        expect(inside(outline, [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]])).toBe(true);
      }
    });
  }

  it('leaves numerals that already fit at their size', () => {
    for (const sides of [6, 12] as DieSides[]) {
      const geometry = dieGeometry(sides);
      for (const value of geometry.values) {
        const [x0, y0, x1, y1] = inkOf(sides, value);
        const scale = fitNumeral(faceOutline(geometry, faceIndexForValue(geometry, value), CELL), (x1! - x0!) * NOMINAL(sides), (y1! - y0!) * NOMINAL(sides));
        expect(scale).toBe(1);
      }
    }
  });
});
