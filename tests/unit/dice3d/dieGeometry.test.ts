import { describe, expect, it } from 'vitest';

import {
  dieGeometry,
  faceIndexForValue,
  faceQuaternion,
  lyingHeight,
  restingQuaternion,
  type DieSides,
} from '../../../src/app/dice3d/dieGeometry';
import { qRotate, vDot, vLength, vSub } from '../../../src/app/dice3d/vectorMath';

const ALL: DieSides[] = [4, 6, 8, 10, 12, 20];

describe('die bodies', () => {
  it.each(ALL)('the d%i has exactly as many faces', (sides) => {
    expect(dieGeometry(sides).faces).toHaveLength(sides);
  });

  it.each(ALL)('the d%i carries every number exactly once', (sides) => {
    const { values } = dieGeometry(sides);
    expect([...values].sort((a, b) => a - b)).toEqual(
      Array.from({ length: sides }, (_, i) => i + 1),
    );
  });

  it.each(ALL)('all normals of the d%i point outwards', (sides) => {
    const { normals, centers } = dieGeometry(sides);
    for (let i = 0; i < normals.length; i++) {
      expect(vDot(normals[i]!, centers[i]!)).toBeGreaterThan(0);
    }
  });

  it.each(ALL)('all vertices of a d%i face lie in one plane', (sides) => {
    const { faces, vertices, normals, centers } = dieGeometry(sides);
    for (let i = 0; i < faces.length; i++) {
      for (const v of faces[i]!) {
        expect(Math.abs(vDot(vSub(vertices[v]!, centers[i]!), normals[i]!))).toBeLessThan(1e-6);
      }
    }
  });

  it.each(ALL)('the numeral up of the d%i is perpendicular to the normal', (sides) => {
    const { ups, normals } = dieGeometry(sides);
    for (let i = 0; i < ups.length; i++) {
      expect(Math.abs(vDot(ups[i]!, normals[i]!))).toBeLessThan(1e-9);
      expect(vLength(ups[i]!)).toBeCloseTo(1, 9);
    }
  });

  // The printed rule of every real die; only the d4 lacks it, having no
  // opposite faces.
  it.each([6, 8, 10, 12, 20] as DieSides[])(
    'opposite faces of the d%i add up to n+1',
    (sides) => {
      const { normals, values } = dieGeometry(sides);
      for (let i = 0; i < normals.length; i++) {
        const opposite = normals.findIndex((n, j) => j !== i && vDot(normals[i]!, n) < -0.999);
        expect(opposite).toBeGreaterThanOrEqual(0);
        expect(values[i]! + values[opposite]!).toBe(sides + 1);
      }
    },
  );
});

describe('target orientation', () => {
  it.each(ALL)('puts the target face of the d%i on top, numeral readable', (sides) => {
    const geometry = dieGeometry(sides);
    for (let value = 1; value <= sides; value++) {
      const face = faceIndexForValue(geometry, value);
      const q = faceQuaternion(geometry, face);
      const normal = qRotate(q, geometry.normals[face]!);
      const up = qRotate(q, geometry.ups[face]!);

      // Seen from above: the face is on top and the numeral's head points to
      // −Z, up on screen.
      expect(normal[1]).toBeCloseTo(1, 9);
      expect(up[2]).toBeCloseTo(-1, 9);
    }
  });

  // A die at rest lies on the table: one whole face touches it and nothing
  // reaches lower. Standing on an edge or a tip is no way to come to rest.
  it.each(ALL)('the d%i comes to rest lying on a face', (sides) => {
    const geometry = dieGeometry(sides);
    for (let face = 0; face < sides; face++) {
      for (const yaw of [0, 0.3, -0.3]) {
        const q = restingQuaternion(geometry, face, yaw);
        const heights = geometry.vertices.map((v) => qRotate(q, v)[1]);
        const lowest = Math.min(...heights);
        expect(heights.filter((y) => y - lowest < 1e-6).length).toBeGreaterThanOrEqual(3);
        expect(-lowest).toBeCloseTo(lyingHeight(geometry), 6);
      }
    }
  });

  it.each([6, 8, 10, 12, 20] as DieSides[])('the rolled face of a resting d%i is the one on top', (sides) => {
    const geometry = dieGeometry(sides);
    for (let face = 0; face < sides; face++) {
      expect(qRotate(restingQuaternion(geometry, face, 0.2), geometry.normals[face]!)[1]).toBeCloseTo(1, 9);
    }
  });

  // No face of a d4 lies on top. It rests on the rolled face, tip up, and the
  // face turned to the viewer (+Z) reads upright.
  it('a resting d4 lies on its rolled face, one face turned to the viewer', () => {
    const geometry = dieGeometry(4);
    for (let face = 0; face < 4; face++) {
      const q = restingQuaternion(geometry, face);
      expect(qRotate(q, geometry.normals[face]!)[1]).toBeCloseTo(-1, 9);
      const front = geometry.normals.map((n) => qRotate(q, n)).sort((a, b) => b[2] - a[2])[0]!;
      expect(front[0]).toBeCloseTo(0, 9);
      expect(front[2]).toBeGreaterThan(0.9);
    }
  });

  it('finds the face of every number', () => {
    const geometry = dieGeometry(20);
    for (let value = 1; value <= 20; value++) {
      expect(geometry.values[faceIndexForValue(geometry, value)]).toBe(value);
    }
  });
});
