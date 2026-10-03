/**
 * The spark bursts of a throw: a spray at every hard wall hit and a shower when
 * a die comes to rest.
 */

import type { DieAnim } from './dieMotion';
import type { SparkBurst } from './sparks';

export type Crit = 'high' | 'low' | null;

/** Ember colours: hot core, cold ash, one pair per occasion. */
const EMBER = {
  wall: { hot: 0xfff3d0, cool: 0xd9903c },
  land: { hot: 0xffe9b8, cool: 0xc78a3a },
  high: { hot: 0xfffbe8, cool: 0xd9b45c },
  low: { hot: 0xffb08a, cool: 0x7a2f22 },
} as const;

/**
 * **Sparks only at the wall.**
 *
 * They once also flew at every bounce on the table. Well meant, and it read as
 * random: flashes here and there without showing *what* was hit. A spark is
 * information: it says something hard was struck. On the table the die hits
 * nothing, it only lands; at the wall it bangs, and that is where it should
 * spray. Null when this frame has no such hit.
 */
export function wallSparks(die: DieAnim): SparkBurst | null {
  const hit = die.impact;
  if (hit === null || hit.kind !== 'wall' || hit.strength < 0.25) return null;
  // **Sparks stay at the wall.** They used to leave at up to five units per
  // second, barely braked: on a stage five units wide, born at the edge and
  // seen in the middle, which looked like sparks from nowhere although every
  // one came from a wall hit. `speed / drag` is the reach; here it is a good
  // third of a unit, so at the edge.
  return {
    count: Math.round(12 + hit.strength * 24),
    at: hit.at,
    dir: [hit.normal[0], 0.5, hit.normal[2]],
    spread: 0.38,
    shell: 0.14,
    speed: 1.3 + hit.strength * 1.4,
    drag: 7,
    // **Short.** The die peaks at ten units per second; what glows for three
    // tenths of a second ends up at a wall it left long ago and reads as a
    // spark from nowhere. An impact is a flash, not a smoulder: it is over in
    // a tenth and a half, and the body stays near it that long.
    life: 0.14,
    size: 0.23,
    ...EMBER.wall,
    gravity: 5.5,
  };
}

/**
 * **Landing is the burst.**
 *
 * When the die stands, it sprays: a gush, not a trickle. The top roll gets one
 * size bigger, but every throw gets it: this is the moment the whole path led
 * to.
 *
 * What is **gone** is the shock ring. A ring rising over the table is the
 * visual language of hit and miss, and a throw is neither: it is a number. The
 * sparks tell the impact, the glow on the paper tells the rank. A ring in
 * between said nothing that was not already said twice.
 */
export function landingSparks(die: DieAnim, crit: Crit): SparkBurst {
  const grand = crit === 'high';
  const ember = crit === 'high' ? EMBER.high : crit === 'low' ? EMBER.low : EMBER.land;
  return {
    count: grand ? 150 : crit === 'low' ? 52 : 84,
    at: [die.p[0], die.p[1] + die.radius * 0.1, die.p[2]],
    dir: [0, 1, 0],
    spread: grand ? 0.8 : 0.9,
    shell: die.radius * (grand ? 0.95 : 0.7),
    speed: grand ? 3 : 2,
    // The finish may scatter: the die *is* there, nothing comes from nowhere.
    // So only it keeps the long reach.
    drag: grand ? 1.9 : 2.6,
    life: grand ? 1 : 0.62,
    size: grand ? 0.3 : 0.22,
    ...ember,
    gravity: grand ? 2.4 : 3.6,
  };
}
