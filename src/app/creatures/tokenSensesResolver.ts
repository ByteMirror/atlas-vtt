/**
 * The seam between linked statblocks and sight: one object a lighting view asks how each token
 * perceives, and that tells it when the answer may have changed.
 *
 *     const senses = tokenSensesResolver(CreatureIndex.forApp(app), mapSenseRulesSource(app, assetService, () => store.getState()));
 *     const stop = senses.subscribe(() => rebuildSight());   // on destroy: stop()
 *     // while building sight sources, for every vision token:
 *     const { senses: list, sightRange, pending, key } = senses.visionOf(token);
 *
 * What sight does with it:
 * - `senses` are the token's senses (`resolveSenses` gives their definitions and reach).
 * - `sightRange` is how far its normal sight reaches, in game units: unset is unlimited, 0 is no
 *   normal sight at all. It already holds the token's own `vision.range` where set, and else the
 *   radius its statblock says the creature is blind beyond; use it in place of `vision.range`.
 * - `pending`: the statblock is still being read and may change either; show and record nothing
 *   for the token until the announcement that follows.
 * - `key` changes exactly when one of the three does, for caches that compare sources.
 *
 * `subscribe` announces a statblock asked about that was read or changed (`CreatureIndex` is the
 * store React reads through `useCreatureIndex`; this is the same subscription outside React) and
 * a change of the collection's senses or of what it measures in.
 */

import { sameSenses } from '../gameSystems/senseRules';
import type { GameUnit } from '../grid/statedDistance';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import { positiveNumber } from '../utils/numberInput';
import type { CreatureIndex, IndexedCreature } from './CreatureIndex';
import { effectiveVision, ownSenses, type EffectiveVision, type SensedToken } from './creatureSenses';

/** What a senses line is read with: the collection's senses and what it measures in. */
export interface SenseRules {
  definitions: readonly SenseDefinition[];
  unit: GameUnit;
}

/** Where the resolver gets the rules of the collection its tokens are in. */
export interface SenseRulesSource {
  /** The rules now. Called for every token asked about: cheap, with the same definitions list while nothing changed. */
  get(): SenseRules;
  /** Calls `listener` when the rules may have changed; returns the unsubscribe. */
  subscribe?(listener: () => void): () => void;
}

/** The part of `CreatureIndex` the resolver uses. */
export type CreatureSource = Pick<CreatureIndex, 'get' | 'request' | 'subscribe'>;

export interface TokenSensesResolver {
  /** How the token perceives: `effectiveVision` with its statblock's record. */
  visionOf(token: SensedToken): EffectiveVision;
  /** Its senses alone. Shared and frozen where they come from a statblock. */
  sensesOf(token: SensedToken): TokenSense[];
  /** Calls `listener` whenever an answer given since may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

function sameRules(a: SenseRules, b: SenseRules): boolean {
  return a.unit.unitType === b.unit.unitType
    && a.unit.unitDistance === b.unit.unitDistance
    && (a.definitions === b.definitions || sameSenses(a.definitions, b.definitions));
}

/**
 * Resolves how tokens perceive through `creatures` and the `rules` of their collection. A
 * statblock not read yet is requested; until it arrives the answer is `pending`.
 */
export function tokenSensesResolver(creatures: CreatureSource, rules: SenseRulesSource): TokenSensesResolver {
  /**
   * The record its listeners last heard of, for each statblock asked about. Set when first asked
   * and when announced, never by a later read: a reader that sees a new record before the index
   * announces it must not swallow the announcement for the others.
   */
  const announced = new Map<string, IndexedCreature | null | undefined>();
  /** The rules its listeners last heard of; unset until senses were asked for. */
  let announcedRules: SenseRules | undefined;
  const listeners = new Set<() => void>();
  let detach: (() => void) | null = null;

  const announce = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const indexChanged = (): void => {
    let changed = false;
    for (const [path, record] of announced) {
      const current = creatures.get(path);
      if (current === record) continue;
      announced.set(path, current);
      changed = true;
    }
    if (changed) announce();
  };

  const rulesChanged = (): void => {
    if (!announcedRules) return;
    const current = rules.get();
    if (sameRules(current, announcedRules)) return;
    announcedRules = current;
    announce();
  };

  /** The statblock's record, requested when first asked for; undefined until the index has read it. */
  const creatureOf = (path: string): IndexedCreature | null | undefined => {
    const record = creatures.get(path);
    if (announced.has(path)) return record;
    announced.set(path, record);
    // The index tells its listeners that it started reading; the record itself is unchanged then.
    if (record === undefined) creatures.request([path]);
    return record;
  };

  const visionOf = (token: SensedToken): EffectiveVision => {
    const current = rules.get();
    announcedRules ??= current;
    const { definitions, unit } = current;
    // A statblock gives a token its senses while it has none, and its sight range while it sets none.
    const reads = token.statblockPath && (!ownSenses(token, definitions) || positiveNumber(token.vision?.range) === undefined);
    return effectiveVision(token, token.statblockPath && reads ? creatureOf(token.statblockPath) : null, definitions, unit);
  };

  return {
    visionOf,
    sensesOf: (token) => visionOf(token).senses,
    subscribe: (listener) => {
      listeners.add(listener);
      if (!detach) {
        const stops = [creatures.subscribe(indexChanged), rules.subscribe?.(rulesChanged)];
        detach = () => stops.forEach((stop) => stop?.());
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        detach?.();
        detach = null;
      };
    },
  };
}
