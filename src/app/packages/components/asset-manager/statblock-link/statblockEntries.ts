import type { FantasyStatblocksCreature } from '../../../../services/FantasyStatblocksService';

/** A note-backed creature a token can link to. */
export interface StatblockEntry {
  path: string;
  name: string;
  /** What the creature is, e.g. "Huge Dragon · CR 16", or the note's folder when its statblock does not say. */
  detail: string;
}

/** A frontmatter value worth showing: a number or a non-blank string. */
function label(value: unknown): string | null {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** The creature's kind and rating as its system notes them: "Huge Dragon · CR 16", "Solo · Tier 1". */
export function describeCreature(creature: FantasyStatblocksCreature): string {
  const kind = [label(creature.size), label(creature.type)].filter(Boolean).join(' ');
  const cr = label(creature.cr);
  const tier = label(creature.tier);
  const level = label(creature.level);
  const rating = cr ? `CR ${cr}` : tier ? `Tier ${tier}` : level ? `Level ${level}` : '';
  return [kind, rating].filter(Boolean).join(' · ');
}

/** The folder a note lives in, `/` for the vault root. */
export function noteFolder(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash > 0 ? path.slice(0, slash) : '/';
}

/** Only note-backed creatures can be linked (the link is a note path), sorted by name. */
export function statblockEntries(creatures: readonly FantasyStatblocksCreature[]): StatblockEntry[] {
  return creatures
    .filter((creature): creature is FantasyStatblocksCreature & { path: string } => Boolean(creature.name && creature.path))
    .map((creature) => ({
      path: creature.path,
      name: creature.name,
      detail: describeCreature(creature) || noteFolder(creature.path),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Entries whose name or detail holds every word of the query, those whose name
 * starts with it first, so "drag" lists dragons before "Adult Red Dragon".
 */
export function filterStatblockEntries(entries: readonly StatblockEntry[], query: string): StatblockEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...entries];
  const terms = needle.split(/\s+/);
  const matches = entries.filter((entry) => {
    const haystack = `${entry.name} ${entry.detail}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  const leads = (entry: StatblockEntry): number => (entry.name.toLowerCase().startsWith(needle) ? 0 : 1);
  return matches.sort((a, b) => leads(a) - leads(b));
}
