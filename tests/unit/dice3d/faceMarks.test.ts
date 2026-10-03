import { describe, expect, it } from 'vitest';
import { dieGeometry, type DieSides } from '../../../src/app/dice3d/dieGeometry';
import { faceMarks } from '../../../src/app/dice3d/faceMarks';
import { faceOutline } from '../../../src/app/dice3d/faceFrame';
import { fitNumeral } from '../../../src/app/dice3d/numeralFit';

const CELL = 256;

describe('faceMarks', () => {
  it.each([6, 8, 10, 12, 20] as DieSides[])('gives each face of the d%i its own number, centred and upright', (sides) => {
    const geometry = dieGeometry(sides);
    for (let face = 0; face < sides; face++) {
      expect(faceMarks(geometry, face, CELL)).toEqual([
        { value: geometry.values[face], at: [0, 0], up: [0, 1], room: faceOutline(geometry, face, CELL) },
      ]);
    }
  });

  describe('on the d4', () => {
    const geometry = dieGeometry(4);

    it('writes at each corner the number of the face that lies down when that corner is the tip', () => {
      for (let face = 0; face < 4; face++) {
        const marks = faceMarks(geometry, face, CELL);
        expect(marks).toHaveLength(3);
        geometry.faces[face]!.forEach((vertex, i) => {
          const lyingDown = geometry.faces.findIndex((corners) => !corners.includes(vertex));
          expect(marks[i]!.value).toBe(geometry.values[lyingDown]);
        });
      }
    });

    it('turns each number head first to its corner', () => {
      for (let face = 0; face < 4; face++) {
        const outline = faceOutline(geometry, face, CELL);
        faceMarks(geometry, face, CELL).forEach((mark, i) => {
          const [cx, cy] = outline[i]!;
          const reach = Math.hypot(cx, cy);
          expect(mark.up[0]).toBeCloseTo(cx / reach, 9);
          expect(mark.up[1]).toBeCloseTo(cy / reach, 9);
          // Between the centre and the corner.
          expect(Math.hypot(...mark.at)).toBeLessThan(reach);
          expect(mark.at[0] * cx + mark.at[1] * cy).toBeGreaterThan(0);
        });
      }
    });

    it('leaves each number room of its own', () => {
      for (const mark of faceMarks(geometry, 0, CELL)) {
        // A numeral a sixth of the cell high still fits its corner of the face.
        expect(fitNumeral(mark.room, CELL * 0.11, CELL * 0.16)).toBe(1);
        // The corner itself lies straight above the numeral, in its own frame.
        const top = mark.room.reduce((a, b) => (b[1] > a[1] ? b : a));
        expect(top[0]).toBeCloseTo(0, 9);
      }
    });
  });
});
