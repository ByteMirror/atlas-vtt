import { describe, expect, it } from 'vitest';
import { readWall } from '../../lighting/lightingObjects';
import { concerns, splitBlocking } from '../../lighting/segments';
import type { TokenEntity } from '../../types';
import type { Point } from '../../types/visionTypes';
import type { WallChannel, WallSegment } from '../../types/wallTypes';
import { lightLevelAt } from '../lightLevels';
import { seenSpots } from '../perception';
import { computeSight, lightReach } from '../sight';
import { blocksFrom, computeVisibility, pointInPolygon } from '../visibility';

function wall(p1: Point, p2: Point, overrides: Partial<WallSegment> = {}): WallSegment {
  return { id: `w_${p1.x}_${p1.y}_${p2.x}_${p2.y}`, kind: 'wall', type: 'solid', p1, p2, ...overrides };
}

const origin = { x: 0, y: 0 };
const behind = { x: 0, y: 100 };
/** A wall south of the origin, between it and `behind`. */
const south = (overrides: Partial<WallSegment> = {}): WallSegment => wall({ x: -50, y: 50 }, { x: 50, y: 50 }, overrides);
const CHANNELS: WallChannel[] = ['sight', 'light'];
const passes = (walls: WallSegment[], channel?: WallChannel): boolean => pointInPolygon(behind, computeVisibility(origin, 200, walls, undefined, channel));

describe('walls that block one thing', () => {
  it.each([
    ['a wall without a kind', {}, { sight: false, light: false }],
    ['a wall for sight only', { blocks: 'sight' }, { sight: false, light: true }],
    ['a wall for light only', { blocks: 'light' }, { sight: true, light: false }],
    ['a closed door for sight only', { blocks: 'sight', type: 'door', closed: true }, { sight: false, light: true }],
    ['an open door for sight only', { blocks: 'sight', type: 'door', closed: false }, { sight: true, light: true }],
    ['a locked secret door for light only', { blocks: 'light', type: 'secret-door', closed: true, locked: true }, { sight: true, light: false }],
  ] as [string, Partial<WallSegment>, Record<WallChannel, boolean>][])('%s lets pass what it does not block', (_name, overrides, expected) => {
    for (const channel of CHANNELS) expect([channel, passes([south(overrides)], channel)]).toEqual([channel, expected[channel]]);
  });

  it('blocks everything for a caller that names no channel: a mix-up fails closed', () => {
    expect(passes([south({ blocks: 'sight' })])).toBe(false);
    expect(passes([south({ blocks: 'light' })])).toBe(false);
  });

  it('keeps a one-way wall one-way for the thing it blocks, and is no wall for the other', () => {
    const oneWay = south({ direction: 'right', blocks: 'light' });
    const [near, far] = [origin, behind];
    expect(blocksFrom(oneWay, near, 'light')).not.toBe(blocksFrom(oneWay, far, 'light'));
    expect(blocksFrom(oneWay, near, 'sight')).toBe(false);
    expect(blocksFrom(oneWay, far, 'sight')).toBe(false);
  });

  it('decides as before for walls without a kind, whichever channel asks', () => {
    const walls = [south(), wall({ x: 80, y: -40 }, { x: 80, y: 60 }, { type: 'door', closed: true }), wall({ x: -90, y: -90 }, { x: -20, y: -120 }, { direction: 'left' })];
    const before = computeVisibility(origin, 300, walls);
    for (const channel of CHANNELS) expect(computeVisibility(origin, 300, walls, undefined, channel)).toEqual(before);
  });

  it('gives sight its walls: a token sees through glass and not through a curtain', () => {
    const sees = (kind: Partial<WallSegment>): boolean => {
      const sight = computeSight([{ tokenId: 'v', origin, range: 300, senses: [] }], [south(kind)]);
      return pointInPolygon(behind, sight.regions[0]!.polygon!);
    };
    expect(sees({ blocks: 'light' })).toBe(true);
    expect(sees({ blocks: 'sight' })).toBe(false);
    expect(sees({})).toBe(false);
  });

  it('gives light its walls: a torch shines through a curtain and not through glass, and the light level follows', () => {
    const level = (kind: Partial<WallSegment>): string => lightLevelAt(behind, { ambient: 0 }, [lightReach(origin, 200, [south(kind)], 150)]);
    expect(level({ blocks: 'sight' })).toBe('bright');
    expect(level({ blocks: 'light' })).toBe('dark');
    expect(level({})).toBe('dark');
  });

  it('cuts a footprint by the walls sight reads', () => {
    const party = { id: 'p', kind: 'token', imagePath: 'p.png', x: 0, y: 40, size: 1, vision: { enabled: true } } as TokenEntity;
    const reaches = (kind: Partial<WallSegment>): boolean => {
      const [spot] = seenSpots({ all: false, regions: [] }, { ambient: 0 }, [], { p: party }, 70, [south(kind)]);
      return pointInPolygon({ x: 0, y: 60 }, spot!.polygon);
    };
    expect(reaches({ blocks: 'light' })).toBe(true);
    expect(reaches({ blocks: 'sight' })).toBe(false);
    expect(reaches({})).toBe(false);
  });

  it('splits the walls a channel reads into two-way and one-way ones', () => {
    const walls = [south(), south({ id: 'curtain', blocks: 'sight' }), south({ id: 'glass', blocks: 'light' }), south({ id: 'slit', blocks: 'light', direction: 'left' }), south({ id: 'open', type: 'door', closed: false })];
    expect(splitBlocking(walls, 'light').twoWay).toHaveLength(2);
    expect(splitBlocking(walls, 'light').oneWay.map((w) => w.id)).toEqual(['slit']);
    expect(splitBlocking(walls, 'sight').twoWay).toHaveLength(2);
    expect(splitBlocking(walls, 'sight').oneWay).toEqual([]);
    // Without a channel every wall that blocks anything counts.
    expect(splitBlocking(walls).twoWay).toHaveLength(3);
    expect(concerns(walls[1]!, 'light')).toBe(false);
    expect(concerns(walls[0]!, 'light')).toBe(true);
  });

  it('reads a kind it does not know as a wall for both, and leaves the file\'s record as it is', () => {
    const strange = { ...south(), blocks: 'sound' } as unknown as WallSegment;
    const read = readWall(strange)!;
    expect(read.blocks).toBeUndefined();
    expect((strange as unknown as { blocks: string }).blocks).toBe('sound');
    expect(passes([read], 'sight')).toBe(false);
    expect(passes([read], 'light')).toBe(false);
    const curtain = south({ blocks: 'sight' });
    expect(readWall(curtain)).toBe(curtain);
    expect(readWall({ ...south(), blocks: 7 })!.blocks).toBeUndefined();
  });
});
