import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../gameSystems/senses';
import type { GameUnit } from '../../grid/statedDistance';
import type { SenseDefinition, TokenSense } from '../../types/senseTypes';
import { parseSenses, type ParsedSenses } from '../parseSenses';
import type { ExpectedSense, ExpectedSenses, FixtureSystem } from './sensesFixtures';

export const FEET: GameUnit = { unitType: 'feet', unitDistance: 5 };
export const METRES: GameUnit = { unitType: 'meters', unitDistance: 1.5 };
export const SQUARES: GameUnit = { unitType: 'units', unitDistance: 1 };

export const DND = BUILT_IN_SENSES['builtin:dnd5e']!;
export const PATHFINDER = BUILT_IN_SENSES['builtin:pathfinder2e']!;
export const OSE = BUILT_IN_SENSES['builtin:ose']!;
export const SHADOWDARK = BUILT_IN_SENSES['builtin:shadowdark']!;

export const SYSTEMS: Record<FixtureSystem, readonly SenseDefinition[]> = {
  dnd5e: DND,
  pathfinder2e: PATHFINDER,
  ose: OSE,
  generic: GENERIC_SENSES,
};

/** Parsed senses by the names of their definitions, so no test depends on an id. */
export function named(senses: readonly TokenSense[], definitions: readonly SenseDefinition[]): ExpectedSense[] {
  return senses.map((sense) => {
    const name = definitions.find((definition) => definition.id === sense.id)?.name ?? `? ${sense.id}`;
    return sense.range === undefined ? [name] : [name, sense.range];
  });
}

function summary(parsed: ParsedSenses, definitions: readonly SenseDefinition[]): ExpectedSenses {
  return {
    senses: named(parsed.senses, definitions),
    unknown: parsed.unknown,
    ...(parsed.blindBeyond && { blindBeyond: parsed.blindBeyondRange ?? true }),
  };
}

export function read(text: string, definitions: readonly SenseDefinition[], unit: GameUnit = FEET, locale = 'en'): ExpectedSenses {
  return summary(parseSenses(text, definitions, unit, locale), definitions);
}
