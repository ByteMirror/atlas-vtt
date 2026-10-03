import { readWall } from '../lighting/lightingObjects';
import type { WallSegment } from '../types/wallTypes';

const lists = new WeakMap<Record<string, WallSegment>, readonly WallSegment[]>();

/**
 * The walls of a store's `objects.walls` as an array, the same array for as long as the
 * record is unchanged (Immer keeps its reference), so sight and shadow caches keyed on the
 * array only rebuild when walls actually change. What the record holds that is no wall is
 * left out (`readWall`).
 */
export function wallList(walls: Record<string, WallSegment>): readonly WallSegment[] {
  let list = lists.get(walls);
  if (!list) {
    list = Object.values(walls).flatMap((wall) => readWall(wall) ?? []);
    lists.set(walls, list);
  }
  return list;
}
