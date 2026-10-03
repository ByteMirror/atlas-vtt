/**
 * Reading senses: which ones a collection has, finding one, comparing two lists, and what a
 * sense makes of a light level.
 */

import type { LightLevel, Seeing, SenseDefinition, SenseRole } from '../types/senseTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { GENERIC_SENSES } from './senses/generic';

/**
 * The senses tokens of a collection can have: its own, else those of the preset it was set
 * from, else the generic set (no game system, or one whose rules have no senses).
 */
export function collectionSenses(
  settings: { senses?: readonly SenseDefinition[] | undefined; systemPresetId?: string | undefined },
  presets: readonly SystemPreset[],
): readonly SenseDefinition[] {
  return settings.senses
    ?? presets.find((preset) => preset.id === settings.systemPresetId)?.rules.senses
    ?? GENERIC_SENSES;
}

/**
 * The definition a token's sense points at: the collection's, else the generic one of that id,
 * so a generic sense stays usable in a collection whose system does not list it.
 */
export function findSense(definitions: readonly SenseDefinition[], id: string): SenseDefinition | undefined {
  return definitions.find((sense) => sense.id === id) ?? GENERIC_SENSES.find((sense) => sense.id === id);
}

/** The collection's sense an old darkvision or tremorsense number is read as; the generic one where it has none. */
export function senseWithRole(definitions: readonly SenseDefinition[], role: SenseRole): SenseDefinition {
  const sense = definitions.find((candidate) => candidate.role === role) ?? GENERIC_SENSES.find((candidate) => candidate.role === role);
  if (!sense) throw new Error(`No generic sense stands for ${role}`);
  return sense;
}

function sameSense(a: SenseDefinition, b: SenseDefinition): boolean {
  return a.id === b.id
    && a.name === b.name
    && a.description === b.description
    && a.grants === b.grants
    && a.lineOfSight === b.lineOfSight
    && a.sees.bright === b.sees.bright
    && a.sees.dim === b.sees.dim
    && a.sees.dark === b.sees.dark
    && a.sees.magicalDark === b.sees.magicalDark
    && a.look === b.look
    && a.reveals === b.reveals
    && a.precise === b.precise
    && a.seesInvisible === b.seesInvisible
    && a.worksWhileBlinded === b.worksWhileBlinded
    && a.range === b.range
    && a.defaultRange === b.defaultRange
    && a.ignores === b.ignores
    && a.role === b.role;
}

/** Whether two lists give tokens the same senses, ids included since tokens record them; none is the generic set. */
export function sameSenses(a: readonly SenseDefinition[] | undefined, b: readonly SenseDefinition[] | undefined): boolean {
  const left = a ?? GENERIC_SENSES;
  const right = b ?? GENERIC_SENSES;
  return left.length === right.length && left.every((sense, i) => sameSense(sense, right[i]!));
}

/**
 * Whether the sense shows the map with the tokens on it: only a sense walls stop. One that
 * reaches through walls senses creatures, whatever its stored `reveals` says, so nothing of the
 * map is ever drawn or remembered past a wall.
 */
export function showsMap(sense: Pick<SenseDefinition, 'reveals' | 'lineOfSight'>): boolean {
  return sense.reveals === 'all' && sense.lineOfSight;
}

/**
 * The light level a point at `level` counts as for a token perceiving it through `sense`:
 * `bright`, `dim`, or null when the sense perceives nothing there.
 */
export function perceivedLevel(sense: SenseDefinition, level: LightLevel): 'bright' | 'dim' | null {
  const seeing: Seeing = level === 'magical-dark' ? sense.sees.magicalDark : sense.sees[level];
  switch (seeing) {
    case 'none': return null;
    case 'as-bright': return 'bright';
    case 'as-dim': return 'dim';
    case 'normal': return level === 'dim' ? 'dim' : 'bright';
  }
}
