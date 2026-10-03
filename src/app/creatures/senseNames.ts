/**
 * Which of a collection's senses a statblock means by a name. Senses are found by their names,
 * the names other rulebooks use for them, and what they stand for (`role`, `grants`), never by id.
 */

import type { SenseDefinition, SenseGrant, SenseRole } from '../types/senseTypes';

/** What statblocks call a sense, and the collection's sense that stands for it. */
interface SenseAlias {
  phrases: readonly string[];
  /** Names of the senses meant, the closest first. */
  senses: readonly string[];
  /** Where the collection has none of them: its sense that stands for this old token field. */
  role?: SenseRole;
  /** Or its modifier that grants this. */
  grants?: SenseGrant;
}

const ALIASES: readonly SenseAlias[] = [
  { phrases: ['darkvision', 'superior darkvision'], senses: ['darkvision'], role: 'darkvision' },
  { phrases: ['greater darkvision'], senses: ['greater darkvision', 'darkvision'], role: 'darkvision' },
  { phrases: ['infravision', 'ultravision'], senses: ['infravision'], role: 'darkvision' },
  { phrases: ['blindsight', 'blindsense'], senses: ['blindsight'] },
  { phrases: ['tremorsense'], senses: ['tremorsense'], role: 'tremorsense' },
  { phrases: ['truesight', 'true seeing'], senses: ['truesight'] },
  { phrases: ['devil sight'], senses: ['devil\'s sight'] },
  { phrases: ['see invisibility', 'see the unseen', 'see invisible', 'sees invisible'], senses: [], grants: 'see-invisible' },
];

/** Words a statblock puts around a sense's name: "Senses darkvision", "infravision to 60′". */
const LEADING_WORDS = new Set(['senses', 'sense', 'has', 'with']);
const TRAILING_WORDS = new Set(['to', 'of', 'up', 'out', 'within', 'range', 'radius']);

/** A name as names are compared: letters and digits only, so "Low-light vision", "lowlight vision" and "Devil’s Sight" need no entry each. */
function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const lookups = new WeakMap<readonly SenseDefinition[], ReadonlyMap<string, SenseDefinition>>();

/** Every name the collection's senses answer to; their own names first, so a collection may redefine an alias. */
function lookupOf(definitions: readonly SenseDefinition[]): ReadonlyMap<string, SenseDefinition> {
  const cached = lookups.get(definitions);
  if (cached) return cached;

  const byName = new Map<string, SenseDefinition>();
  for (const definition of definitions) {
    const key = nameKey(definition.name);
    if (key && !byName.has(key)) byName.set(key, definition);
  }
  const lookup = new Map(byName);
  for (const alias of ALIASES) {
    const named = alias.senses.map((name) => byName.get(nameKey(name))).find((definition) => definition !== undefined);
    const sense = named ?? definitions.find((definition) => (
      (alias.role !== undefined && definition.role === alias.role) || (alias.grants !== undefined && definition.grants === alias.grants)
    ));
    if (!sense) continue;
    for (const phrase of alias.phrases) {
      const key = nameKey(phrase);
      if (!lookup.has(key)) lookup.set(key, sense);
    }
  }
  lookups.set(definitions, lookup);
  return lookup;
}

/**
 * The collection's sense `name` stands for, or undefined. The whole name must be a sense:
 * "blood scent" is not scent. Words around it that say nothing ("Senses", "to") are skipped.
 */
export function senseNamed(name: string, definitions: readonly SenseDefinition[]): SenseDefinition | undefined {
  const words = wordsOf(name);
  let start = 0;
  let end = words.length;
  const lookup = lookupOf(definitions);
  for (;;) {
    const sense = lookup.get(words.slice(start, end).join(''));
    if (sense || end - start <= 1) return sense;
    if (LEADING_WORDS.has(words[start]!)) start++;
    else if (TRAILING_WORDS.has(words[end - 1]!)) end--;
    else return undefined;
  }
}
