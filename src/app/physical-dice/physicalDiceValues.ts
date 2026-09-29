/**
 * How a die of the formula is thrown on the physical table, and how its faces
 * read back as the number a player would call out.
 *
 * The table's d10 is numbered 0-9 and its d100 is the tens die (00-90), as on
 * real dice. A d10 showing 0 is a 10. A percentile roll throws the tens die with
 * a d10 for the ones, and 00 with 0 is 100.
 */
const PHYSICAL_SIDES = new Set([4, 6, 8, 10, 12, 20]);

/** Table dice to throw for one die of the formula, or null when the table has no such die. */
export function tableDiceFor(sides: number): string[] | null {
  if (sides === 100) return ['d100', 'd10'];
  return PHYSICAL_SIDES.has(sides) ? [`d${sides}`] : null;
}

/** The value of one formula die from the faces its table dice came up on. */
export function readTableDice(sides: number, faces: readonly number[]): number {
  if (sides === 100) {
    const [tens = 0, ones = 0] = faces;
    const value = tens + ones;
    return value === 0 ? 100 : value;
  }
  const face = faces[0] ?? 0;
  return sides === 10 && face === 0 ? 10 : face;
}
