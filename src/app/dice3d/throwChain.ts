/**
 * The order of a throw. The dice of a roll leave the hand together; a die
 * rolled because another exploded is thrown only when that die lies: an
 * explosion is something that happens, not something that was always there.
 */

import type { DiceCrit } from '../tools/diceCrit';
import type { DiePlan } from './diceScene';
import { beginRoll, type DieAnim } from './dieMotion';
import type { Rng } from './dieTour';
import type { Quat } from './vectorMath';

/** Dice leave one after another, as from one hand, not in chorus. */
const STAGGER = 0.075;
/** The beat between a die's burst and the throw of the die rolled for it. */
const CHAIN_PAUSE = 0.18;

/**
 * Launches every die of the plan towards its target. A die that follows an
 * explosion waits out the whole throw of the die before it, which is known
 * here already: a throw's length is planned at its launch, not found out.
 * `rngFor` gives each die its own randomness, by its place in the plan.
 */
export function beginThrow(
  anims: readonly DieAnim[],
  plan: readonly DiePlan[],
  targets: readonly Quat[],
  rngFor: (index: number) => Rng,
  maxWallHits = Infinity,
): void {
  let thrownTogether = 0;
  anims.forEach((anim, i) => {
    const follows = plan[i]?.follows;
    const before = follows === undefined ? undefined : anims[follows];
    const delay = before ? before.delay + before.tour.duration + CHAIN_PAUSE : thrownTogether * STAGGER;
    if (!before) thrownTogether += 1;
    beginRoll(anim, targets[i] ?? anim.q, delay, rngFor(i), maxWallHits);
  });
}

/** How the die at `index` bursts when it lands: it exploded upwards, downwards, or not at all. */
export function burstOf(plan: readonly DiePlan[], index: number): DiceCrit {
  const next = plan[index + 1];
  if (next?.follows !== index) return null;
  return next.subtracts ? 'low' : 'high';
}
