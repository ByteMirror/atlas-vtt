import type { DrawingStroke, NotePin, TextElement, TokenEntity } from '../types';

export interface Point {
  x: number;
  y: number;
}

/** The object collections that copy, paste and duplicate work on. */
export interface CopyableCollections {
  tokens: Record<string, TokenEntity>;
  drawings: Record<string, DrawingStroke>;
  texts: Record<string, TextElement>;
  pins: Record<string, NotePin>;
}

/** Detached copies of map objects, as held on the clipboard or inserted by paste and duplicate. */
export interface MapObjectContent {
  tokens: TokenEntity[];
  drawings: DrawingStroke[];
  texts: TextElement[];
  pins: NotePin[];
}

/**
 * Deep copies of the objects with the given ids, in selection order.
 * Ids of objects that cannot be copied (fog, walls) are ignored.
 */
export function collectMapObjects(objects: CopyableCollections, ids: readonly string[]): MapObjectContent {
  const pick = <T>(collection: Record<string, T>): T[] =>
    ids.flatMap((id) => (collection[id] ? [structuredClone(collection[id])] : []));
  return {
    tokens: pick(objects.tokens),
    drawings: pick(objects.drawings),
    texts: pick(objects.texts),
    pins: pick(objects.pins),
  };
}

export function countMapObjects(content: MapObjectContent): number {
  return content.tokens.length + content.drawings.length + content.texts.length + content.pins.length;
}

/** Every position that defines where the content sits on the map. */
function referencePoints(content: MapObjectContent): Point[] {
  return [
    ...content.tokens,
    ...content.texts,
    ...content.pins,
    ...content.drawings.flatMap((drawing) => drawing.points),
  ].map(({ x, y }) => ({ x, y }));
}

/** Centre of the bounding box around the content's reference points. */
export function contentCenter(content: MapObjectContent): Point {
  const points = referencePoints(content);
  if (points.length === 0) return { x: 0, y: 0 };
  // A loop rather than Math.min(...xs): long pen strokes can exceed the engine's argument limit.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Fresh copies of the content moved by `offset`. Token positions then pass through
 * `placeToken`, which lets callers snap them to the grid.
 */
export function translateMapObjects(
  content: MapObjectContent,
  offset: Point,
  placeToken: (position: Point) => Point = (position) => position,
): MapObjectContent {
  const shift = (point: Point): Point => ({ x: point.x + offset.x, y: point.y + offset.y });
  const move = <T extends Point>(object: T): T => ({ ...structuredClone(object), ...shift(object) });
  return {
    tokens: content.tokens.map((token) => ({ ...structuredClone(token), ...placeToken(shift(token)) })),
    drawings: content.drawings.map((drawing) => ({
      ...structuredClone(drawing),
      points: drawing.points.map(shift),
    })),
    texts: content.texts.map(move),
    pins: content.pins.map(move),
  };
}

/** Position keys of every object, used to tell whether a copy would sit exactly on top of an existing object. */
export function occupiedPositions(objects: CopyableCollections | MapObjectContent): Set<string> {
  const values = <T>(collection: Record<string, T> | T[]): T[] => (Array.isArray(collection) ? collection : Object.values(collection));
  const keys = new Set<string>();
  const add = (kind: string, point: Point | undefined): void => {
    if (point) keys.add(`${kind}:${Math.round(point.x)},${Math.round(point.y)}`);
  };
  values(objects.tokens).forEach((token) => add(`token:${token.imagePath}`, token));
  values(objects.texts).forEach((text) => add('text', text));
  values(objects.pins).forEach((pin) => add('pin', pin));
  values(objects.drawings).forEach((drawing) => add('drawing', drawing.points[0]));
  return keys;
}
