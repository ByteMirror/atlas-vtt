import { describe, expect, it } from 'vitest';
import { beginRoll, makeDie, stepDie } from '../../../src/app/dice3d/dieMotion';
import { qIdentity } from '../../../src/app/dice3d/vectorMath';

/** Same seed, same throw. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Throws one die to rest and counts the walls it hit. */
function wallHits(seed: number, maxWallHits?: number): number {
  const rng = lcg(seed);
  const die = makeDie(rng);
  beginRoll(die, qIdentity(), 0, rng, maxWallHits);
  for (let frame = 0; frame < 600 && die.phase !== 'rest'; frame++) stepDie(die, 1 / 60, rng);
  expect(die.phase).toBe('rest');
  return die.wallHits;
}

describe('wall hits', () => {
  it('stay within the cap of a fast throw', () => {
    for (let seed = 1; seed <= 200; seed++) expect(wallHits(seed, 3)).toBeLessThanOrEqual(3);
  });

  it('are not capped on a normal throw', () => {
    const hits = Array.from({ length: 200 }, (_, i) => wallHits(i + 1));
    expect(Math.max(...hits)).toBeGreaterThan(3);
  });
});
