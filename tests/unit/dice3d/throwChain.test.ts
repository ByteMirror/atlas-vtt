import { describe, expect, it } from 'vitest';
import { sceneFromRolls } from '../../../src/app/dice3d/diceScene';
import { dieGeometry, faceIndexForValue, restingQuaternion } from '../../../src/app/dice3d/dieGeometry';
import { makeDie, stepDie, type DieAnim } from '../../../src/app/dice3d/dieMotion';
import { beginThrow, burstOf } from '../../../src/app/dice3d/throwChain';
import { throwRandom } from '../../../src/app/dice3d/throwSeed';

const d6 = (value: number, more: object = {}): { max: number; value: number } => ({ max: 6, value, ...more });

describe('a throw with exploding dice', () => {
  // 6 explodes into a 6, which explodes into a 2; a 3 beside them.
  const scene = sceneFromRolls([d6(6), d6(6, { exploded: true }), d6(2, { exploded: true }), d6(3)])!;
  const geometry = dieGeometry(6);
  const targets = scene.faces.map((face) => restingQuaternion(geometry, faceIndexForValue(geometry, face)));

  it('throws the dice of the roll at once and each extra die after the die before it has landed', () => {
    const anims = scene.plan.map((_, i) => makeDie(throwRandom('roll', -1 - i)));
    beginThrow(anims, scene.plan, targets, (i) => throwRandom('roll', i));

    const [first, second, third, beside] = anims as [DieAnim, DieAnim, DieAnim, DieAnim];
    // The two dice of the roll leave together, a beat apart; the extra dice wait.
    expect(first.delay).toBe(0);
    expect(beside.delay).toBeGreaterThan(0);
    expect(beside.delay).toBeLessThan(0.2);
    expect(second.delay).toBeGreaterThan(first.tour.duration);
    expect(third.delay).toBeGreaterThan(second.delay + second.tour.duration);

    // Run the throw: no extra die moves before its die lies.
    const rng = throwRandom('roll', 99);
    for (let frame = 0; frame < 60 * 30 && anims.some((anim) => anim.phase !== 'rest'); frame++) {
      const restingBefore = anims.map((anim) => anim.phase === 'rest');
      for (const anim of anims) stepDie(anim, 1 / 60, rng);
      if (second.delay <= 0) expect(restingBefore[0]).toBe(true);
      if (third.delay <= 0) expect(restingBefore[1]).toBe(true);
    }
    expect(anims.every((anim) => anim.phase === 'rest')).toBe(true);
  });

  it('bursts where a die exploded: as a success upwards, as a failure downwards', () => {
    expect(scene.plan.map((_, i) => burstOf(scene.plan, i))).toEqual(['high', 'high', null, null]);
    const fumble = sceneFromRolls([{ max: 10, value: 1 }, { max: 10, value: 7, exploded: true, negative: true }])!;
    expect(fumble.plan.map((_, i) => burstOf(fumble.plan, i))).toEqual(['low', null]);
  });
});
