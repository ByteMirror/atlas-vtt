/**
 * Reads the senses line of a statblock as the senses of a collection, in any of the grammars
 * statblocks use:
 * - D&D 5e: "darkvision 60 ft., blindsight 30 ft. (blind beyond this radius), passive Perception 12",
 *   and the 2024 layout "Blindsight 60 ft., Darkvision 120 ft.; Passive Perception 21".
 * - Pathfinder 2e: "Perception +7; darkvision, scent (imprecise) 30 feet"; a sense without a
 *   distance takes none.
 * - Old-School Essentials: "infravision 60'".
 *
 * Everything outside brackets is either read as a sense or reported in `unknown`. A bracket
 * after a sense is read for its distance (only one with a unit) and for "blind beyond this
 * radius"; whatever else it says ("rat form only", "imprecise") is not read, since the
 * collection's definition decides how the sense behaves.
 */

import { toGameUnits, readDistance, type GameUnit, type StatedDistance } from '../grid/statedDistance';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import { plainText } from './creatureValues';
import { splitPhrase, type PhraseText } from './sensePhrases';
import { senseNamed } from './senseNames';

export interface ParsedSenses {
  /** The senses the line names, each once, in the order written. */
  senses: TokenSense[];
  /**
   * The creature has no normal sight beyond its senses ("blind beyond this radius", "can't sense
   * beyond this radius", "no vision"): its sight ends at `blindBeyondRange`.
   */
  blindBeyond?: boolean;
  /**
   * Game units beyond which it is blind. Unset when it has no normal sight at all: the line gives
   * no radius, or gives it for a sense that shows no map (tremorsense) to a creature without eyes.
   */
  blindBeyondRange?: number;
  /** What names no sense of the collection, as written ("passive Perception 12", "or 10 ft. while deafened"). */
  unknown: string[];
}

const BLIND_BEYOND = /\b(?:blind|can['’]?t sense|cannot sense) beyond\b/i;
const NO_VISION = /^no (?:vision|sight)$/i;
/** What a statblock writes where a creature has no senses to list. */
const PLACEHOLDER = /^(?:[-–—]+|none|n\/a)\.?$/i;
/** Words that join two senses. */
const LEADING_CONNECTOR = /^(?:and|&|plus)(?=\s|$)\s*/i;
const CONNECTOR = /\s(?:and|&|plus)\s/gi;
/** Where a sense's name ends and what limits it begins: "tremorsense within their home". */
const CLAUSE = /\s(?:within|while|when|if|only|except|but|in)\s/i;
/** An alternative to the sense before it: "or 10 ft. while deafened". */
const CONTINUES = /^or\b/i;
const PERCEPTION_SCORE = /^(?:passive\s+)?perception\b/i;

/** "passive Perception 12", "Perception +7 (+9 to Sense Motive)": part of a senses line, never a sense. */
export function isPerceptionScore(phrase: string): boolean {
  return PERCEPTION_SCORE.test(phrase);
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function hasContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** The phrases of a senses line: separated by commas and semicolons outside brackets and numbers ("1,000 feet"). */
function phrasesOf(text: string): string[] {
  const phrases: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '(') depth++;
    else if (char === ')') depth = Math.max(0, depth - 1);
    if (depth > 0 || (char !== ';' && char !== ',')) continue;
    if (char === ',' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue;
    phrases.push(text.slice(start, i));
    start = i + 1;
  }
  phrases.push(text.slice(start));
  return phrases.map((phrase) => phrase.trim()).filter((phrase) => phrase !== '' && !PLACEHOLDER.test(phrase));
}

interface SenseItem {
  definition: SenseDefinition;
  range: number | undefined;
  blind: boolean;
}

interface UnknownItem {
  definition?: undefined;
  text: string;
  /** The first distance it states outside brackets. */
  range: number | undefined;
  blind: boolean;
}

type Item = SenseItem | UnknownItem;

interface Rules {
  definitions: readonly SenseDefinition[];
  unit: GameUnit;
  locale: string | undefined;
}

function gameUnits(distance: StatedDistance | null, unit: GameUnit): number | undefined {
  return distance ? toGameUnits(distance, unit) : undefined;
}

function unknownItem(text: string, rules: Rules): UnknownItem {
  const written = text.trim();
  const distance = readDistance(splitPhrase(written).outside, rules.locale);
  return { text: written, range: gameUnits(distance, rules.unit), blind: BLIND_BEYOND.test(written) };
}

/** A distance in one of the brackets, which counts only with its unit: "(60 ft.)", never "(4th rank)" or "(35 to Sense Motive)". */
function bracketedDistance({ text, brackets }: PhraseText, rules: Rules): StatedDistance | null {
  for (const bracket of brackets) {
    const distance = readDistance(text.slice(bracket.start, bracket.end), rules.locale);
    if (distance?.unit) return distance;
  }
  return null;
}

/** What a phrase begins with: a sense, or something unknown, and where that ends. */
interface Head {
  sense?: SenseItem;
  end: number;
}

function readHead(phrase: string, rules: Rules): Head {
  const split = splitPhrase(phrase);
  const { outside, brackets } = split;
  const first = outside.search(/\S/);
  if (first < 0) return { end: phrase.length };
  // A bracket before any name belongs to nothing that follows: "(35 to Sense Motive) darkvision".
  if (brackets[0] && brackets[0].start < first) return { end: first };

  let distance = readDistance(outside, rules.locale);
  const nameFirst = !distance || /\p{L}/u.test(outside.slice(0, distance.start));
  // "60 ft. darkvision": the name follows the distance.
  const name = !distance ? outside : nameFirst ? outside.slice(0, distance.start) : outside.slice(distance.end);
  let end = distance && nameFirst ? distance.end : phrase.length;
  let definition = senseNamed(name, rules.definitions);
  if (!definition && nameFirst) {
    const clause = CLAUSE.exec(name);
    definition = clause ? senseNamed(name.slice(0, clause.index), rules.definitions) : undefined;
    if (definition && clause) {
      end = clause.index;
      distance = null;
    }
  }

  // The brackets that follow at once still belong to it.
  for (const bracket of brackets) {
    if (bracket.start >= end && outside.slice(end, bracket.start).trim() === '') end = bracket.end;
  }
  const own = { text: phrase, outside, brackets: brackets.filter((bracket) => bracket.start < end) };
  const stated = distance ?? bracketedDistance(own, rules);
  if (!definition || (stated && stated.value <= 0)) return { end };
  const blind = own.brackets.some((bracket) => BLIND_BEYOND.test(phrase.slice(bracket.start, bracket.end)));
  return { end, sense: { definition, range: gameUnits(stated, rules.unit), blind } };
}

/** The parts of a phrase that "and" joins, outside brackets. */
function joinedParts(phrase: string): string[] {
  const { outside } = splitPhrase(phrase);
  const parts: string[] = [];
  let start = 0;
  for (const match of outside.matchAll(CONNECTOR)) {
    parts.push(phrase.slice(start, match.index));
    start = match.index + match[0].length;
  }
  parts.push(phrase.slice(start));
  return parts;
}

/**
 * Everything a phrase says: usually one sense or one unknown phrase. A line that runs senses
 * together ("blindsight 10 ft. darkvision 60 ft.", "darkvision 60 ft. and tremorsense 30 ft.")
 * gives several, and what follows a sense without being one is reported, never dropped. A phrase
 * that names no sense anywhere stays whole.
 */
function readPhrase(text: string, rules: Rules): Item[] {
  const phrase = text.trim();
  if (!hasContent(phrase)) return [];
  const head = readHead(phrase, rules);
  const rest = phrase.slice(head.end);
  const following = readPhrase(rest.trim().replace(LEADING_CONNECTOR, ''), rules);
  const more = following.some((item) => item.definition);
  if (head.sense) return [head.sense, ...(more ? following : hasContent(rest) ? [unknownItem(rest, rules)] : [])];
  if (more) return [unknownItem(phrase.slice(0, head.end), rules), ...following];

  const parts = joinedParts(phrase);
  const joined = parts.length > 1 ? parts.flatMap((part) => readPhrase(part, rules)) : [];
  return joined.some((item) => item.definition) ? joined : [unknownItem(phrase, rules)];
}

/** Whether a phrase is nothing but a bracket. */
function isNote(phrase: string): boolean {
  return splitPhrase(phrase).outside.trim() === '';
}

/** The sense as a token lists it: with the distance stated, which a modifier (`grants`) never takes. */
function senseOf({ definition, range }: SenseItem): TokenSense {
  return range === undefined || definition.grants ? { id: definition.id } : { id: definition.id, range };
}

/** A sense the eyes see with: it shows the map and is lost while blinded. */
function isEyeSense(definition: SenseDefinition): boolean {
  return definition.reveals === 'all' && !definition.worksWhileBlinded && !definition.grants;
}

/** How far a creature that is blind beyond `item` perceives, and whether that is seeing the map. */
function blindRadius(item: Item | undefined): { radius: number | undefined; seeing: boolean } {
  if (!item) return { radius: undefined, seeing: false };
  if (!item.definition) return { radius: item.range, seeing: true };
  const { definition, range } = item;
  const radius = range ?? (definition.range === 'required' ? definition.defaultRange : undefined);
  return { radius, seeing: definition.reveals === 'all' && !definition.grants };
}

/**
 * The senses `text` names among `definitions` (the collection's, as `collectionSenses` gives
 * them), with their distances in the collection's game units (`unit`). `locale` (the user's, by
 * default) decides how "1.000" is read.
 */
export function parseSenses(text: string, definitions: readonly SenseDefinition[], unit: GameUnit, locale?: string): ParsedSenses {
  const rules: Rules = { definitions, unit, locale };
  const senses = new Map<string, SenseItem>();
  const unknown: string[] = [];
  const blindRadii: Array<ReturnType<typeof blindRadius>> = [];
  let blindBeyond = false;
  let previous: Item | undefined;
  /** Whether the item read last was the perception score. */
  let perception = false;

  for (const phrase of phrasesOf(plainText(text))) {
    if (NO_VISION.test(phrase)) {
      blindBeyond = true;
      continue;
    }
    for (const item of readPhrase(phrase, rules)) {
      if (item.definition) {
        if (!senses.has(item.definition.id)) senses.set(item.definition.id, item);
      } else if (perception && isNote(item.text)) {
        // "Perception +33; (35 to Sense Motive) darkvision": the bracket is a note on the score.
        unknown[unknown.length - 1] += ` ${item.text}`;
        perception = false;
        continue;
      } else {
        unknown.push(item.text);
      }
      perception = !item.definition && isPerceptionScore(item.text);
      // "or 10 ft. while deafened (blind beyond this radius)" speaks of the sense before it.
      const continues = !item.definition && (CONTINUES.test(item.text) || item.range === undefined);
      if (item.blind) {
        blindBeyond = true;
        blindRadii.push(blindRadius(continues ? previous : item));
      }
      if (!continues) previous = item;
    }
  }

  const hasEyes = [...senses.values()].some((item) => isEyeSense(item.definition));
  const radii = blindRadii.flatMap(({ radius, seeing }) => (radius !== undefined && (seeing || hasEyes) ? [radius] : []));
  return {
    senses: [...senses.values()].map(senseOf),
    ...(blindBeyond && { blindBeyond }),
    ...(radii.length > 0 && { blindBeyondRange: Math.max(...radii) }),
    unknown,
  };
}
