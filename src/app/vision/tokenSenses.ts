import { findSense, senseWithRole } from '../gameSystems/senseRules';
import { parseTokenSenses } from '../gameSystems/senseValidation';
import type { TokenVision, TokenVisionDefaults } from '../types/lightingTypes';
import type { SenseDefinition, SenseRole, TokenSense } from '../types/senseTypes';
import { positiveNumber } from '../utils/numberInput';

/** The token fields senses replaced, in the order their senses are listed. */
const OLD_FIELDS: readonly SenseRole[] = ['darkvision', 'tremorsense'];

/**
 * The senses of a token: the usable entries of its `senses` once that is a list (even an empty
 * one), else its old `darkvision` and `tremorsense` numbers read as the collection's senses of
 * those kinds, or as the generic ones where the collection has none, each with that number as
 * its distance. The list is stored data, so it is read as `parseTokenSenses` reads it.
 */
export function tokenSenses(
  vision: TokenVision | TokenVisionDefaults | undefined,
  definitions: readonly SenseDefinition[],
): TokenSense[] {
  if (!vision) return [];
  const senses = parseTokenSenses(vision.senses);
  if (senses) return senses;
  return OLD_FIELDS.flatMap((role) => {
    const range = positiveNumber(vision[role]);
    return range === undefined ? [] : [{ id: senseWithRole(definitions, role).id, range }];
  });
}

/** `vision` with `senses` as its senses and without the old fields they replace. */
export function withSenses(vision: TokenVision, senses: TokenSense[]): TokenVision {
  const { darkvision: _darkvision, tremorsense: _tremorsense, ...rest } = vision;
  return { ...rest, senses };
}

/** A token's sense with its definition. */
export interface ResolvedSense {
  definition: SenseDefinition;
  /** How far it reaches, in game units; undefined is without limit. */
  range: number | undefined;
}

/**
 * Each sense with its definition and its reach. A stored distance always limits the sense, so
 * an old darkvision number read as a sense without a distance reaches as far as before. Without
 * one, a sense that needs a distance takes its default. A modifier (`grants`) has no reach.
 * Left out: senses the collection does not know, and senses that need a distance and have neither.
 */
export function resolveSenses(senses: readonly TokenSense[], definitions: readonly SenseDefinition[]): ResolvedSense[] {
  return senses.flatMap((sense) => {
    const definition = findSense(definitions, sense.id);
    if (!definition) return [];
    if (definition.grants) return [{ definition, range: undefined }];
    const range = positiveNumber(sense.range) ?? (definition.range === 'required' ? definition.defaultRange : undefined);
    return definition.range === 'required' && range === undefined ? [] : [{ definition, range }];
  });
}
