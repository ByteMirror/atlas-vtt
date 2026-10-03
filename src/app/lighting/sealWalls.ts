import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { sealTolerance } from './lightingConstants';
import { PointTree } from './pointTree';
import { BOTH, kindOfAll, shared, type BridgeKind } from './sealKinds';
import { farthest, plugs } from './sealPlugs';
import { blocksNothing } from './segments';

/** A hair past the wall a bridge lands on, so the two cross instead of merely touching. */
const OVERSHOOT = 0.01;

/** A wall end with more than this many others near it, or walls passing it, is bridged to fewer than all of them. */
const MAX_BRIDGES = 8;
/** A wall end whose bridges across passing walls would be more than this, however few of them are kept, is closed off whole instead (`plugs`). */
const MAX_CORNERS = 12;
/** So is one that more walls than this pass, whatever they would come to: it is looked at no further. */
const MAX_PASSING = 64;

interface End {
  wall: number;
  end: 'p1' | 'p2';
  point: Point;
  /** The wall's id and the end, as bridges are named after it. */
  label: string;
}

/** A place where walls end: the ends that share the point, in the order of their walls. */
interface Junction {
  /** Its place among the junctions, in the order of their first walls. */
  index: number;
  point: Point;
  ends: End[];
  /** `firstEnds`, once they were asked for. */
  first?: End[];
  /** `kindOf`, once it was asked for. */
  kind?: BridgeKind;
}

/**
 * Closes the gaps of hand-drawn joints before walls reach light or sight, without moving a
 * wall: every wall end within `tolerance` of another wall's end gets a solid bridge to it, and
 * every wall end within `tolerance` of another wall's middle (and not of its ends) gets a bridge
 * that lands just across it. Returns the walls unchanged followed by the bridges; wider gaps
 * stay open for light and sight alike.
 *
 * A bridge blocks what the walls it joins block (`shared`): the one thing where they all block
 * that thing only, else both, a curtain's joint with glass too. So for sight and for light alike,
 * every joint between two walls that block it is closed for it, and a bridge that blocks more
 * than its walls only ever closes more. A bridge between two limited walls is limited, so a row
 * of hedges counts as one hedge; where a limited wall meets a solid one the bridge is solid.
 * Where a place is crowded and bridged to fewer than all, its bridges are solid and block both:
 * the chain that stands in for a pair's bridge may lead over the ends of walls of any sort.
 *
 * The bridges grow with the wall ends, not with their pairs: an end with more than
 * `MAX_BRIDGES` others near it is bridged to the nearest in each of eight directions only
 * (`endBridges`), and one that more walls pass is bridged across those that reach farthest from
 * it (`middleBridges`). Both stop every ray that a bridge for every pair would stop, between
 * points farther than the tolerance from the wall ends. A damaged or foreign map with thousands
 * of ends in one place would otherwise make millions of bridges and never open: as it is, at
 * most `MAX_BRIDGES` bridges are begun at a place, as many again to the far ends of walls on
 * their own, and sixteen across the walls that pass it (twelve of its own, or a plug's).
 */
export function sealWalls(walls: readonly WallSegment[], tolerance: number): WallSegment[] {
  const junctions = new Map<string, Junction>();
  walls.forEach((wall, i) => {
    if (!hasLength(wall)) return;
    for (const end of ['p1', 'p2'] as const) {
      const point = wall[end];
      let junction = junctions.get(pointKey(point));
      if (!junction) junctions.set(pointKey(point), (junction = { index: junctions.size, point, ends: [] }));
      junction.ends.push({ wall: i, end, point, label: `${wall.id}:${end}` });
    }
  });
  const places = [...junctions.values()];
  const tree = new PointTree(Float64Array.from(places, (junction) => junction.point.x), Float64Array.from(places, (junction) => junction.point.y));
  return [...walls, ...endBridges(walls, places, junctions, tree, tolerance), ...middleBridges(walls, places, tree, tolerance)];
}

const sealed = new WeakMap<readonly WallSegment[], Map<number, readonly WallSegment[]>>();

/** `sealWalls` at the tolerance of a map's texel, the same array for as long as the input is unchanged. */
export function sealedWalls(walls: readonly WallSegment[], texel: number): readonly WallSegment[] {
  let byTexel = sealed.get(walls);
  if (!byTexel) sealed.set(walls, (byTexel = new Map<number, readonly WallSegment[]>()));
  let result = byTexel.get(texel);
  if (!result) {
    result = sealWalls(walls, sealTolerance(texel));
    byTexel.set(texel, result);
  }
  return result;
}

/**
 * One bridge per pair of nearby places where different walls end; coinciding ends need none.
 * A place with more than `MAX_BRIDGES` others near it is bridged to the nearest in each of eight
 * directions (45° each) only (`PointTree.nearestByDirection`). That closes every gap that bridging all of them would: towards any
 * place B near a place A, the nearest in B's direction is no farther from A than B is, and
 * nearer to B than A is (the directions are narrower than 60°), and so on from there, so a chain
 * of bridges leads from A to B without leaving the circle around B that A lies on. What a bridge
 * from A to B would part, the chain parts too, but for what lies inside that circle, within the
 * tolerance of both. The two ends of one wall need no bridge, the wall being between them; where
 * that wall is an open door, blocks one way only, blocks one thing only or is limited it does
 * not part everything, so its other end is not the nearest that counts, and the next nearest in
 * that direction is taken. Nor can a chain go on along such a wall when it arrives at one of its
 * ends: where the nearest in a direction is the end of a wall on its own that does not part
 * everything, the wall's other end is bridged from here as well (`loneMate`), for it may be the
 * place the chain was to lead to.
 */
function endBridges(walls: readonly WallSegment[], junctions: readonly Junction[], byPoint: ReadonlyMap<string, Junction>, tree: PointTree, tolerance: number): WallSegment[] {
  const bridges = new Map<number, { a: Junction; b: Junction; pair: NonNullable<ReturnType<typeof firstPair>> }>();
  // Places bridged to fewer than all: a chain that stands in for a pair's bridge leads over them.
  const crowdedPlaces = new Uint8Array(junctions.length);
  const few: number[] = [];
  const nearest = new Int32Array(8);
  const distances = new Float64Array(8);
  for (const a of junctions) {
    // The first neighbours found, one more than are all bridged: with that one the place is crowded.
    few.length = 0;
    tree.within(a.point.x, a.point.y, tolerance, (index) => {
      if (index !== a.index) few.push(index);
      return few.length > MAX_BRIDGES;
    });
    // The chain may run along a wall from one of its ends to the other only if the wall stops everything.
    const crowded = few.length > MAX_BRIDGES;
    if (crowded) crowdedPlaces[a.index] = 1;
    if (crowded) tree.nearestByDirection(a.point.x, a.point.y, tolerance, (index) => endsOfOneOpenWall(walls, a, junctions[index]!), nearest, distances);
    // In the order of the places, whatever order the tree found them in: unrelated walls elsewhere change nothing here.
    const join = (b: Junction): void => {
      const key = Math.min(a.index, b.index) * junctions.length + Math.max(a.index, b.index);
      if (bridges.has(key)) return;
      const pair = firstPair(a, b);
      if (pair) bridges.set(key, { a, b, pair });
    };
    for (const index of crowded ? [...nearest].sort(ascending) : few.sort(ascending)) {
      if (index < 0) continue;
      join(junctions[index]!);
      const mate = crowded ? loneMate(walls, junctions[index]!, byPoint) : null;
      if (mate && mate !== a && Math.hypot(mate.point.x - a.point.x, mate.point.y - a.point.y) <= tolerance) join(mate);
    }
  }
  // A bridge at a crowded place blocks both, whatever meets there: the chains lead over walls of any kind.
  return [...bridges.values()].map(({ a, b, pair }) => bridge(`seal:${pair.first}:${pair.second}`, pair.from, pair.to, crowdedPlaces[a.index] || crowdedPlaces[b.index] ? BOTH : shared(kindOf(walls, a), kindOf(walls, b))));
}

/** Whether a wall lets something past it: an open door, a wall that blocks one way only or one thing only, or a limited wall. */
function partsNotAll(wall: WallSegment): boolean {
  return blocksNothing(wall) || !!wall.direction || wall.blocks !== undefined || !!wall.limited;
}

/**
 * The place of the other end of the wall that ends at `junction`, if that wall stands on its own
 * (nothing else ends at either of its ends) and does not stop everything (`partsNotAll`).
 */
function loneMate(walls: readonly WallSegment[], junction: Junction, byPoint: ReadonlyMap<string, Junction>): Junction | null {
  if (junction.ends.length !== 1) return null;
  const { wall: index, end } = junction.ends[0]!;
  const wall = walls[index]!;
  if (!partsNotAll(wall)) return null;
  const mate = byPoint.get(pointKey(wall[end === 'p1' ? 'p2' : 'p1']));
  return mate && mate.ends.length === 1 ? mate : null;
}

const ascending = (a: number, b: number): number => a - b;

/** What the walls that end in a place block (`kindOfAll`), worked out once. */
function kindOf(walls: readonly WallSegment[], junction: Junction): BridgeKind {
  return (junction.kind ??= kindOfAll(junction.ends.map((end) => walls[end.wall]!)));
}

/** Whether two places hold nothing but the two ends of one wall, and that wall does not stop everything (`partsNotAll`). */
function endsOfOneOpenWall(walls: readonly WallSegment[], a: Junction, b: Junction): boolean {
  if (a.ends.length !== 1 || b.ends.length !== 1 || a.ends[0]!.wall !== b.ends[0]!.wall) return false;
  return partsNotAll(walls[a.ends[0]!.wall]!);
}

/**
 * The bridge between two places is named after the pair of ends, of different walls, whose
 * labels sort first, and runs from the end of the earlier wall; a pair of places that hold the
 * two ends of one wall and nothing else needs none. Only the first labels of each place can be
 * that pair: its first, and its first of another wall.
 */
function firstPair(a: Junction, b: Junction): { first: string; second: string; from: Point; to: Point } | null {
  let best: { first: string; second: string; from: Point; to: Point } | null = null;
  for (const x of (a.first ??= firstEnds(a))) {
    for (const y of (b.first ??= firstEnds(b))) {
      if (x.wall === y.wall) continue;
      const [first, second] = x.label < y.label ? [x.label, y.label] : [y.label, x.label];
      if (best && (best.first < first || (best.first === first && best.second <= second))) continue;
      const [from, to] = x.wall < y.wall ? [x.point, y.point] : [y.point, x.point];
      best = { first, second, from, to };
    }
  }
  return best;
}

/** The end of a place whose label sorts first, and the first among its ends of other walls. */
function firstEnds(junction: Junction): End[] {
  let first = junction.ends[0]!;
  for (const end of junction.ends) if (end.label < first.label) first = end;
  let other: End | null = null;
  for (const end of junction.ends) if (end.wall !== first.wall && (!other || end.label < other.label)) other = end;
  return other ? [first, other] : [first];
}

interface MiddleBridge {
  wall: number;
  end: End;
  landing: Point;
  /** The place the bridge starts at. */
  from: Junction;
}

/**
 * Bridges from a wall end across the nearby middle of another wall (a T-junction stopping
 * short). Where more than `MAX_BRIDGES` walls pass one end, only the bridges that reach
 * farthest are made: those whose landing is a corner of the convex hull of the end and all its
 * landings (`farthest`). A ray is stopped by the bridges of an end exactly when one of their
 * landings lies beyond it, and for every line that is so of a corner of the hull, if of any
 * landing at all, so the fewer bridges stop the same rays. The nearest ones would not: eight
 * walls passing an end nearer than the wall it stops short of left that gap open. The corners
 * are kept as the walls are met, so an end holds a handful of landings however many walls pass it.
 *
 * An end with more than `MAX_CORNERS` such corners, or that more than `MAX_PASSING` walls pass,
 * is closed off whole (`plugs`): no ray enters the tolerance around it, which stops all that
 * its bridges would and more.
 */
function middleBridges(walls: readonly WallSegment[], junctions: readonly Junction[], tree: PointTree, tolerance: number): WallSegment[] {
  const passing: (MiddleBridge[] | undefined)[] = [];
  /** How many walls passed each end so far. */
  const passed = new Uint8Array(junctions.length);
  // An end that is closed off whole is looked at no more, which is what keeps a pile of walls beside a pile of ends quick.
  const plugged = new Uint8Array(junctions.length);
  walls.forEach((wall, j) => {
    const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
    const len2 = dx * dx + dy * dy;
    if (!hasLength(wall)) return;
    tree.beside(wall.p1, wall.p2, tolerance, plugged, (index) => {
      const junction = junctions[index]!;
      const p = junction.point;
      const u = ((p.x - wall.p1.x) * dx + (p.y - wall.p1.y) * dy) / len2;
      const foot = { x: wall.p1.x + dx * u, y: wall.p1.y + dy * u };
      if (Math.hypot(p.x - foot.x, p.y - foot.y) > tolerance) return;
      // The end that stops short: of the earliest wall. This wall's own ends are its p1 and p2, which are not beside it.
      const end = junction.ends[0]!;
      const across = acrossDirection(p, foot, walls[end.wall]![end.end === 'p1' ? 'p2' : 'p1'], dx, dy);
      let list = (passing[index] ??= []);
      list.push({ wall: j, end, landing: { x: foot.x + across.x * OVERSHOOT, y: foot.y + across.y * OVERSHOOT }, from: junction });
      if (++passed[index]! <= MAX_BRIDGES) return;
      // Only the corners of the hull count from the ninth wall on: what lies inside it now lies inside it for good.
      passing[index] = list = farthest(p, list);
      if (list.length > MAX_CORNERS || passed[index]! > MAX_PASSING) plugged[index] = 1;
    });
  });
  const kept: (MiddleBridge & { capped: boolean })[] = [];
  passing.forEach((list, index) => {
    if (!list || plugged[index]) return;
    // The fewer bridges stand in for all of them, for walls of any kind: they are solid and block both.
    const capped = passed[index]! > MAX_BRIDGES;
    for (const candidate of list) kept.push({ ...candidate, capped });
  });
  return [
    ...kept
      .sort((a, b) => a.wall - b.wall || a.end.wall - b.end.wall || a.end.end.localeCompare(b.end.end))
      .map(({ wall, end, landing, from, capped }) => bridge(`seal:${end.label}:${walls[wall]!.id}`, end.point, landing, capped ? BOTH : shared(kindOf(walls, from), walls[wall]!))),
    ...plugs(junctions.filter((junction) => plugged[junction.index]).map((junction) => junction.point), tolerance + OVERSHOOT).map(({ id, p1, p2 }) => bridge(id, p1, p2)),
  ];
}

/** Unit vector from `p` across the wall at `foot`; for an end on the wall, away from its own wall. */
function acrossDirection(p: Point, foot: Point, ownOtherEnd: Point, dx: number, dy: number): Point {
  const fx = foot.x - p.x, fy = foot.y - p.y;
  const length = Math.hypot(fx, fy);
  if (length > 1e-9) return { x: fx / length, y: fy / length };
  const normal = { x: -dy / Math.hypot(dx, dy), y: dx / Math.hypot(dx, dy) };
  const side = (ownOtherEnd.x - foot.x) * normal.x + (ownOtherEnd.y - foot.y) * normal.y;
  return side > 0 ? { x: -normal.x, y: -normal.y } : normal;
}

/**
 * Whether a wall spans a distance that can be worked with. One without length joins nothing, and
 * one with a coordinate that is no finite number (a damaged map file) has no place to seal.
 */
function hasLength(wall: WallSegment): boolean {
  const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
  const length2 = dx * dx + dy * dy;
  return length2 > 0 && Number.isFinite(length2);
}

function pointKey(p: Point): string {
  return `${p.x},${p.y}`;
}

function bridge(id: string, p1: Point, p2: Point, kind: BridgeKind = BOTH): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1: { ...p1 }, p2: { ...p2 }, ...(kind.blocks && { blocks: kind.blocks }), ...(kind.limited && { limited: true }) };
}
