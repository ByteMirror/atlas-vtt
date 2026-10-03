/**
 * An exploding rule in words, for the settings. A rule counts faces from the
 * top and the bottom of a die, which nobody thinks in: people think "a 10
 * rolls again". So the settings say what the rule does to a die they know.
 */

import { explodingFaces } from '../tools/diceExplosion';
import type { ExplodeRule } from '../types/diceRulesTypes';

/** A run of faces as it is spoken: `10`, `9 or 10`, `96 to 100`; nothing for none. */
function faceRun(first: number, last: number): string {
  if (last < first) return '';
  if (last === first) return String(last);
  return last === first + 1 ? `${first} or ${last}` : `${first} to ${last}`;
}

/** The faces of a die of `sides` that explode when its `highFaces` highest do. */
export function highFaceNames(sides: number, highFaces: number): string {
  const { high } = explodingFaces(sides, highFaces, 0);
  return faceRun(sides - high + 1, sides);
}

/** The faces of a die of `sides` that roll again and subtract; `highFaces` are taken first. */
export function lowFaceNames(sides: number, lowFaces: number, highFaces: number): string {
  return faceRun(1, explodingFaces(sides, highFaces, lowFaces).low);
}

/** A second die to show beside the default die that "every die" means more than one size. */
function otherDie(sides: number): number {
  return sides === 6 ? 20 : 6;
}

/** What the rule does, said with a die of `sides`: the die of the collection's default roll. */
export function describeExplodeRule(rule: ExplodeRule, sides: number): string {
  const { highFaces, lowFaces } = rule;
  const again = 'is rolled again and the new die is';
  const sentences: string[] = [];

  if (rule.dice === 'default') {
    sentences.push(`A default die (d${sides}) that shows ${highFaceNames(sides, highFaces)} ${again} added.`);
    const low = lowFaceNames(sides, lowFaces, highFaces);
    if (low) sentences.push(`One that shows ${low} ${again} subtracted.`);
  } else {
    const other = otherDie(sides);
    const faces = highFaces === 1 ? 'its highest face' : `one of its ${highFaces} highest faces`;
    sentences.push(
      `Every die that shows ${faces} ${again} added: a d${sides} on ${highFaceNames(sides, highFaces)}, a d${other} on ${highFaceNames(other, highFaces)}.`,
    );
    if (lowFaces > 0) {
      const lowest = lowFaces === 1 ? 'its lowest face' : `one of its ${lowFaces} lowest faces`;
      sentences.push(`One that shows ${lowest} ${again} subtracted.`);
    }
  }

  sentences.push(rule.repeats ? 'The new die can explode too.' : 'The new die does not explode.');
  return sentences.join(' ');
}
