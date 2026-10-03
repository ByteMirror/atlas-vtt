import { wallList } from '../../vision/wallList';
import { zoneHandlePoint } from '../../lighting/lightZones';
import type { LightZone } from '../../types/lightingTypes';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';

/** Screen pixels. */
export const ZONE_CORNER_RADIUS = 4.5;
export const ZONE_HANDLE_RADIUS = 11;
const CORNER_HIT = 9;
const HANDLE_HIT = 13;
/** How close to a wall's end, or to the first corner of the zone being drawn, a click lands on it. */
const SNAP = 10;

/** A corner of a zone: which zone, and which of its corners. */
export interface ZoneCorner {
  zoneId: string;
  index: number;
}

function nearest<T>(candidates: Iterable<[T, Point]>, point: Point, reach: number): T | null {
  let found: T | null = null;
  let best = reach;
  for (const [candidate, at] of candidates) {
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= best) {
      best = distance;
      found = candidate;
    }
  }
  return found;
}

/** The corner at the world `point` at viewport `zoom`: the nearest one within reach, of the later zone where two share a place. */
export function zoneCornerAt(zones: readonly LightZone[], point: Point, zoom: number): ZoneCorner | null {
  const corners = [...zones].reverse().flatMap((zone) => zone.polygon.map((corner, index): [ZoneCorner, Point] => [{ zoneId: zone.id, index }, corner]));
  return nearest(corners, point, CORNER_HIT / zoom);
}

/** The zone whose handle (`zoneHandlePoint`) is at the world `point`. */
export function zoneHandleAt(zones: readonly LightZone[], point: Point, zoom: number): string | null {
  return nearest([...zones].reverse().map((zone): [string, Point] => [zone.id, zoneHandlePoint(zone.polygon)]), point, HANDLE_HIT / zoom);
}

/** `point`, or the wall end it lies close to: a zone drawn along walls ends exactly on them. */
export function snapToWallEnd(point: Point, walls: Record<string, WallSegment>, zoom: number): Point {
  const ends = wallList(walls).flatMap((wall): [Point, Point][] => [[wall.p1, wall.p1], [wall.p2, wall.p2]]);
  return nearest(ends, point, SNAP / zoom) ?? point;
}

/** Whether a click at `point` lands on the first corner of the zone being drawn, which closes it. */
export function closesDraft(draft: readonly Point[], point: Point, zoom: number): boolean {
  const first = draft[0];
  return draft.length >= 3 && !!first && Math.hypot(point.x - first.x, point.y - first.y) <= SNAP / zoom;
}

/** The colour a zone's handle shows its light in: its tint (white without one) at its level, as the eye takes it. */
export function zoneLightColor(zone: Pick<LightZone, 'ambient' | 'ambientColor'>): number {
  const tint = Number.parseInt((zone.ambientColor ?? '#ffffff').slice(1), 16);
  const level = Math.min(1, Math.max(0, zone.ambient)) ** (1 / 2.2);
  const channel = (shift: number): number => Math.round(((tint >> shift) & 0xff) * level);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
