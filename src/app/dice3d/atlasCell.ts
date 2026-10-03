/** The face atlas of a die: one square cell per face, plus a blank one for chamfers and corners. */

import type { DieSides } from './dieGeometry';

/** Edge length of an atlas cell in pixels. */
export const CELL = 256;

/** Small seeded random generator: same seed, same sequence. */
export function seededRandom(seed: number): () => number {
  let s = (seed || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One atlas cell per face plus a blank one for chamfers and corners. */
export function atlasLayout(sides: DieSides): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt(sides + 1));
  return { cols, rows: Math.ceil((sides + 1) / cols) };
}
