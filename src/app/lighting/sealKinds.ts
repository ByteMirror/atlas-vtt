import type { WallSegment } from '../types/wallTypes';

/**
 * What a bridge is, by the walls it joins: it blocks one thing where they all block that thing
 * only, else both, and it is limited only where they are all limited, else solid.
 */
export type BridgeKind = Pick<WallSegment, 'blocks' | 'limited'>;

/** A solid bridge that blocks both: what closes a joint whatever meets there. */
export const BOTH: BridgeKind = {};

/** What `walls` are together: for one thing if every one of them blocks that thing only, limited if every one of them is. */
export function kindOfAll(walls: readonly WallSegment[]): BridgeKind {
  const blocks = walls[0]?.blocks;
  return { ...(blocks !== undefined && walls.every((wall) => wall.blocks === blocks) && { blocks }), ...(walls.every((wall) => wall.limited) && { limited: true as const }) };
}

/**
 * What a bridge between two kinds is: for the one thing both block and nothing else, or for
 * both; limited between two limited kinds, so a row of hedges is one hedge, and solid where a
 * hedge meets a wall.
 */
export function shared(a: BridgeKind, b: BridgeKind): BridgeKind {
  return { ...(a.blocks !== undefined && a.blocks === b.blocks && { blocks: a.blocks }), ...(a.limited && b.limited && { limited: true }) };
}
