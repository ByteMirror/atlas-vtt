import type { Point } from '../types/visionTypes';

/** The points a node keeps without splitting further. */
const LEAF = 12;

/**
 * Points in a k-d tree, each node with the box around its points: what lies near a point or
 * beside a segment is found without looking at the rest, however crowded a place is and however
 * long the segment. Points are named by their index in the arrays the tree was built from.
 */
export class PointTree {
  /** The points' indices, arranged so that every node's points are a run of them. */
  private readonly order: Uint32Array;
  /** Per node, the box around its points: least x, least y, greatest x, greatest y. The children of node n are 2n + 1 and 2n + 2. */
  private readonly boxes: Float64Array;
  /**
   * Per node, the same along the diagonals: least and greatest x + y, least and greatest x − y.
   * The eight directions meet on the diagonals through a point, so a box alone cannot tell which
   * of two neighbouring directions the points of a diagonal run lie in (`mayHoldNearer`): every
   * box of such a run reached into the empty direction beside it, and none was ever passed over.
   */
  private readonly slants: Float64Array;
  /** Per node, whether every point of it was marked as passed (`beside`). */
  private spent: Uint8Array | null = null;
  /** Where `select` takes its next pivot from: the same sequence for every tree, so the same points make the same tree. */
  private seed = 0x9e3779b9;

  constructor(private readonly xs: Float64Array, private readonly ys: Float64Array) {
    const count = xs.length;
    this.order = new Uint32Array(count);
    for (let i = 0; i < count; i++) this.order[i] = i;
    let nodes = 1;
    for (let size = count; size > LEAF; size = Math.ceil(size / 2)) nodes = nodes * 2 + 1;
    this.boxes = new Float64Array(nodes * 4);
    this.slants = new Float64Array(nodes * 4);
    if (count > 0) this.build(0, 0, count);
  }

  /**
   * Visits the points within `radius` of (x, y) until `visit` returns true. A point is within the
   * radius when `Math.hypot` says so, as whoever measures the distance of two points does: its
   * square and the radius' may fall on different sides in the last bit.
   */
  within(x: number, y: number, radius: number, visit: (index: number) => boolean): void {
    this.walkWithin(0, 0, this.order.length, x, y, radius, visit);
  }

  /**
   * The nearest point within `radius` of (x, y) in each of eight directions (45° each: which
   * half plane on each axis, and which axis is the longer), written to `nearest` (-1 where there
   * is none; of two equally near, the one with the lower index). Points at (x, y) itself and
   * those `skip` names are passed over. A node is opened only while a direction it reaches into
   * has no nearer point yet.
   */
  nearestByDirection(x: number, y: number, radius: number, skip: (index: number) => boolean, nearest: Int32Array, distances: Float64Array): void {
    nearest.fill(-1);
    distances.fill(radius * radius * (1 + 1e-12));
    this.walkDirections(0, 0, this.order.length, x, y, radius, skip, nearest, distances);
  }

  /**
   * Visits the points beside a segment: within `reach` of it, their nearest point on it between
   * its ends, farther than `reach` from both ends, and not marked in `passed`. Marks are only ever added to `passed`, by
   * the caller, for as long as it uses the tree: a node whose points are all marked is remembered
   * and never opened again.
   */
  beside(a: Point, b: Point, reach: number, passed: Uint8Array, visit: (index: number) => void): void {
    this.spent ??= new Uint8Array(this.boxes.length / 4);
    const dx = b.x - a.x, dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    this.walkBeside(0, 0, this.order.length, { ax: a.x, ay: a.y, bx: b.x, by: b.y, dx, dy, length2, reach, reach2: reach * reach, lineReach2: reach * reach * length2 * (1 + 1e-9) }, passed, visit);
  }

  private build(node: number, lo: number, hi: number): void {
    const { xs, ys, order, boxes } = this;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let sum0 = Infinity, sum1 = -Infinity, difference0 = Infinity, difference1 = -Infinity;
    for (let i = lo; i < hi; i++) {
      const x = xs[order[i]!]!, y = ys[order[i]!]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x + y < sum0) sum0 = x + y;
      if (x + y > sum1) sum1 = x + y;
      if (x - y < difference0) difference0 = x - y;
      if (x - y > difference1) difference1 = x - y;
    }
    boxes.set([x0, y0, x1, y1], node * 4);
    this.slants.set([sum0, sum1, difference0, difference1], node * 4);
    if (hi - lo <= LEAF) return;
    const mid = (lo + hi) >> 1;
    this.select(lo, hi - 1, mid, x1 - x0 >= y1 - y0 ? xs : ys);
    this.build(node * 2 + 1, lo, mid);
    this.build(node * 2 + 2, mid, hi);
  }

  /**
   * Arranges order[left..right] so that the point at `k` is the one a sort by `keys` would put
   * there (quickselect). The pivot is taken anywhere in the range, by a fixed sequence of
   * numbers: the middle one is the least of what is left, time after time, where two sorted
   * runs follow each other (two strokes drawn side by side), and the tree took the square of
   * their length to build.
   */
  private select(left: number, right: number, k: number, keys: Float64Array): void {
    const { order } = this;
    while (left < right) {
      this.seed ^= this.seed << 13;
      this.seed ^= this.seed >>> 17;
      this.seed ^= this.seed << 5;
      const pivot = keys[order[left + ((this.seed >>> 0) % (right - left + 1))]!]!;
      let i = left, j = right;
      while (i <= j) {
        while (keys[order[i]!]! < pivot) i++;
        while (keys[order[j]!]! > pivot) j--;
        if (i > j) break;
        const held = order[i]!;
        order[i++] = order[j]!;
        order[j--] = held;
      }
      if (k <= j) right = j;
      else if (k >= i) left = i;
      else return;
    }
  }

  /** The square of the distance from (x, y) to a node's box. */
  private boxDistance2(node: number, x: number, y: number): number {
    const { boxes } = this, b = node * 4;
    const dx = x < boxes[b]! ? boxes[b]! - x : x > boxes[b + 2]! ? x - boxes[b + 2]! : 0;
    const dy = y < boxes[b + 1]! ? boxes[b + 1]! - y : y > boxes[b + 3]! ? y - boxes[b + 3]! : 0;
    return dx * dx + dy * dy;
  }

  /**
   * No point of a node is nearer to (x, y) than this, squared: the distance to its box, or to the
   * band its points lie in along either diagonal, whichever is more. A run of points along a
   * diagonal fills a sliver of its box, and the box alone is near to much that the run is far from.
   */
  private nodeDistance2(node: number, x: number, y: number): number {
    const { slants } = this, b = node * 4;
    const sum = x + y, difference = x - y;
    const offSum = sum < slants[b]! ? slants[b]! - sum : sum > slants[b + 1]! ? sum - slants[b + 1]! : 0;
    const offDifference = difference < slants[b + 2]! ? slants[b + 2]! - difference : difference > slants[b + 3]! ? difference - slants[b + 3]! : 0;
    // A step of d along x + y is d / √2 away; a hair is taken off, so that rounding never puts the bound past a point.
    return Math.max(this.boxDistance2(node, x, y), Math.max(offSum, offDifference) ** 2 * 0.5 * (1 - 1e-9));
  }

  private walkWithin(node: number, lo: number, hi: number, x: number, y: number, radius: number, visit: (index: number) => boolean): boolean {
    // A hair more than the radius' square: no box is passed over for the last bit of a point on the very edge.
    if (this.boxDistance2(node, x, y) > radius * radius * (1 + 1e-12)) return false;
    if (hi - lo > LEAF) {
      const mid = (lo + hi) >> 1;
      return this.walkWithin(node * 2 + 1, lo, mid, x, y, radius, visit) || this.walkWithin(node * 2 + 2, mid, hi, x, y, radius, visit);
    }
    for (let i = lo; i < hi; i++) {
      const index = this.order[i]!;
      if (Math.hypot(this.xs[index]! - x, this.ys[index]! - y) <= radius && visit(index)) return true;
    }
    return false;
  }

  private walkDirections(node: number, lo: number, hi: number, x: number, y: number, radius: number, skip: (index: number) => boolean, nearest: Int32Array, distances: Float64Array): void {
    const distance2 = this.nodeDistance2(node, x, y);
    if (!this.mayHoldNearer(node, x, y, distance2, distances)) return;
    if (hi - lo > LEAF) {
      const mid = (lo + hi) >> 1, first = node * 2 + 1, second = node * 2 + 2;
      // The nearer child first: what it holds lets most of the other be passed over.
      if (this.nodeDistance2(first, x, y) <= this.nodeDistance2(second, x, y)) {
        this.walkDirections(first, lo, mid, x, y, radius, skip, nearest, distances);
        this.walkDirections(second, mid, hi, x, y, radius, skip, nearest, distances);
      } else {
        this.walkDirections(second, mid, hi, x, y, radius, skip, nearest, distances);
        this.walkDirections(first, lo, mid, x, y, radius, skip, nearest, distances);
      }
      return;
    }
    for (let i = lo; i < hi; i++) {
      const index = this.order[i]!, dx = this.xs[index]! - x, dy = this.ys[index]! - y;
      const d2 = dx * dx + dy * dy;
      const direction = (dx < 0 ? 4 : 0) + (dy < 0 ? 2 : 0) + (steeper(this.xs[index]!, this.ys[index]!, x, y, dx < 0, dy < 0) ? 1 : 0);
      if (d2 === 0 || d2 > distances[direction]! || (d2 === distances[direction] && index > nearest[direction]!) || Math.hypot(dx, dy) > radius || skip(index)) continue;
      nearest[direction] = index;
      distances[direction] = d2;
    }
  }

  /**
   * Whether a node reaches into a direction from (x, y) whose nearest point so far is farther
   * than the node's box: its box must reach into that direction, and so must its bounds along
   * the diagonal the direction ends at. Which of the two directions of a quarter a point lies in
   * is told by x − y (to the right and down the screen, to the left and up) or by x + y (the other two).
   */
  private mayHoldNearer(node: number, x: number, y: number, distance2: number, distances: Float64Array): boolean {
    const { boxes, slants } = this, b = node * 4;
    const x0 = boxes[b]! - x, y0 = boxes[b + 1]! - y, x1 = boxes[b + 2]! - x, y1 = boxes[b + 3]! - y;
    const sum = x + y, difference = x - y;
    const sum0 = slants[b]!, sum1 = slants[b + 1]!, difference0 = slants[b + 2]!, difference1 = slants[b + 3]!;
    for (let left = 0; left < 2; left++) {
      if (left ? x0 >= 0 : x1 < 0) continue;
      // How far the box lies from (x, y) along x on this side, at the least and at the most.
      const nearX = left ? Math.max(-x1, 0) : Math.max(x0, 0), farX = left ? -x0 : x1;
      for (let up = 0; up < 2; up++) {
        if (up ? y0 >= 0 : y1 < 0) continue;
        const nearY = up ? Math.max(-y1, 0) : Math.max(y0, 0), farY = up ? -y0 : y1;
        const direction = left * 4 + up * 2;
        // As `steeper` tells the two directions of a quarter apart, for the points with the least and the greatest of the sums.
        const steep = left === up ? (left ? difference1 > difference : difference0 < difference) : left ? sum1 > sum : sum0 < sum;
        const flat = left === up ? (left ? difference0 <= difference : difference1 >= difference) : left ? sum0 <= sum : sum1 >= sum;
        if (steep && nearX < farY && distances[direction + 1]! >= distance2) return true;
        if (flat && farX >= nearY && distances[direction]! >= distance2) return true;
      }
    }
    return false;
  }

  private walkBeside(node: number, lo: number, hi: number, line: Line, passed: Uint8Array, visit: (index: number) => void): void {
    const { boxes, xs, ys, order } = this, b = node * 4;
    const spent = this.spent!;
    if (spent[node]) return;
    const x0 = boxes[b]!, y0 = boxes[b + 1]!, x1 = boxes[b + 2]!, y1 = boxes[b + 3]!;
    // Nothing of the box is beside the segment when all of it lies within reach of one end, or its middle farther from the segment than its corners reach.
    if (farthest2(x0, y0, x1, y1, line.ax, line.ay) <= line.reach2 || farthest2(x0, y0, x1, y1, line.bx, line.by) <= line.reach2) return;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const t = line.length2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - line.ax) * line.dx + (cy - line.ay) * line.dy) / line.length2));
    if (Math.hypot(cx - line.ax - t * line.dx, cy - line.ay - t * line.dy) > line.reach + Math.hypot(x1 - x0, y1 - y0) / 2) return;
    // Nor when all of it lies to one side of the segment's line, farther than the reach: its corners nearest to the line tell.
    const least = ((line.dy > 0 ? x0 : x1) - line.ax) * line.dy - ((line.dx > 0 ? y1 : y0) - line.ay) * line.dx;
    const most = ((line.dy > 0 ? x1 : x0) - line.ax) * line.dy - ((line.dx > 0 ? y0 : y1) - line.ay) * line.dx;
    if ((least > 0 && least * least > line.lineReach2) || (most < 0 && most * most > line.lineReach2)) return;
    // Nor when all of it lies before the segment's start or past its end, as seen along the segment.
    const before = ((line.dx > 0 ? x1 : x0) - line.ax) * line.dx + ((line.dy > 0 ? y1 : y0) - line.ay) * line.dy;
    const past = ((line.dx > 0 ? x0 : x1) - line.ax) * line.dx + ((line.dy > 0 ? y0 : y1) - line.ay) * line.dy;
    if (before <= 0 || past >= line.length2) return;
    if (hi - lo > LEAF) {
      const mid = (lo + hi) >> 1;
      this.walkBeside(node * 2 + 1, lo, mid, line, passed, visit);
      this.walkBeside(node * 2 + 2, mid, hi, line, passed, visit);
      if (spent[node * 2 + 1] && spent[node * 2 + 2]) spent[node] = 1;
      return;
    }
    let left = 0;
    for (let i = lo; i < hi; i++) {
      const index = order[i]!;
      if (passed[index]) continue;
      left++;
      const ax = xs[index]! - line.ax, ay = ys[index]! - line.ay;
      const cross = ax * line.dy - ay * line.dx, along = ax * line.dx + ay * line.dy;
      if (cross * cross > line.lineReach2 || along <= 0 || along >= line.length2 || ax * ax + ay * ay <= line.reach2) continue;
      const bx = xs[index]! - line.bx, by = ys[index]! - line.by;
      if (bx * bx + by * by > line.reach2) visit(index);
    }
    // Counted before the visits, which may mark more: such a leaf is found spent at its next opening.
    if (left === 0) spent[node] = 1;
  }
}

/**
 * Whether (px, py) lies from (x, y) in the direction of its quarter whose longer way is along y
 * (|dx| < |dy|), told by x − y or x + y of the two points: the sums a node keeps the bounds of,
 * taken the same way, so that what `mayHoldNearer` rules out of a node is ruled out of its points.
 */
export function steeper(px: number, py: number, x: number, y: number, left: boolean, up: boolean): boolean {
  if (left === up) return left ? px - py > x - y : px - py < x - y;
  return left ? px + py > x + y : px + py < x + y;
}

interface Line {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  dx: number;
  dy: number;
  length2: number;
  reach: number;
  reach2: number;
  /** The square of the reach as a cross product with the segment measures it, a hair more: a point that far from the line is beside it. */
  lineReach2: number;
}

/** The square of the distance from (x, y) to the farthest corner of a box. */
function farthest2(x0: number, y0: number, x1: number, y1: number, x: number, y: number): number {
  const dx = Math.max(Math.abs(x - x0), Math.abs(x - x1)), dy = Math.max(Math.abs(y - y0), Math.abs(y - y1));
  return dx * dx + dy * dy;
}
