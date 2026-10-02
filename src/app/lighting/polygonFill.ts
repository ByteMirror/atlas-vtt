import type { Point } from '../types/visionTypes';

/** An outline's edge that is not level, from its upper end to its lower, with the turn it adds to a point on its right. */
interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  winding: 1 | -1;
}

function xAt(edge: Edge, y: number): number {
  return edge.x1 + ((y - edge.y1) * (edge.x2 - edge.x1)) / (edge.y2 - edge.y1);
}

/** The height at which two edges cross inside both, or null when they do not. */
function crossingY(a: Edge, b: Edge): number | null {
  const [ax, ay, bx, by] = [a.x2 - a.x1, a.y2 - a.y1, b.x2 - b.x1, b.y2 - b.y1];
  const denominator = ax * by - ay * bx;
  if (denominator === 0) return null;
  const t = ((b.x1 - a.x1) * by - (b.y1 - a.y1) * bx) / denominator;
  const u = ((b.x1 - a.x1) * ay - (b.y1 - a.y1) * ax) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1 ? a.y1 + t * ay : null;
}

/**
 * The area a closed outline fills, by the nonzero rule a canvas fills with, as trapezoids that do
 * not overlap. An outline drawn by hand may cross itself, and a triangulation of it (PIXI's
 * `Graphics.poly`) can then fill ground far from the outline; these pieces are convex, so they
 * fill as they are. The outline is cut into level strips at every corner and every crossing:
 * within a strip no two edges cross, and each stretch between edges with a turn left over is one piece.
 */
export function filledPieces(outline: readonly Point[]): Point[][] {
  const edges: Edge[] = [];
  outline.forEach((from, index) => {
    const to = outline[(index + 1) % outline.length]!;
    if (from.y < to.y) edges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, winding: 1 });
    else if (from.y > to.y) edges.push({ x1: to.x, y1: to.y, x2: from.x, y2: from.y, winding: -1 });
  });
  const heights = new Set(outline.map((point) => point.y));
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const y = crossingY(edges[i]!, edges[j]!);
      if (y !== null) heights.add(y);
    }
  }
  const levels = [...heights].sort((a, b) => a - b);
  const pieces: Point[][] = [];
  for (let i = 0; i + 1 < levels.length; i++) {
    const [top, bottom] = [levels[i]!, levels[i + 1]!];
    const middle = (top + bottom) / 2;
    const across = edges.filter((edge) => edge.y1 <= top && edge.y2 >= bottom).sort((a, b) => xAt(a, middle) - xAt(b, middle));
    let winding = 0;
    let left: Edge | null = null;
    for (const edge of across) {
      const before = winding;
      winding += edge.winding;
      if (before === 0) left = edge;
      else if (winding === 0 && left) {
        // The two edges may meet at a level, never cross it: rounding must not put the right one left of the left.
        const [leftTop, leftBottom] = [xAt(left, top), xAt(left, bottom)];
        const [rightTop, rightBottom] = [Math.max(leftTop, xAt(edge, top)), Math.max(leftBottom, xAt(edge, bottom))];
        if (rightTop > leftTop || rightBottom > leftBottom) {
          pieces.push([{ x: leftTop, y: top }, { x: rightTop, y: top }, { x: rightBottom, y: bottom }, { x: leftBottom, y: bottom }]);
        }
      }
    }
  }
  return pieces;
}
