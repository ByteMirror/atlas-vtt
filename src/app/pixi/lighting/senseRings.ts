import { showsMap } from '../../gameSystems/senseRules';
import { NORMAL_SIGHT } from '../../gameSystems/senses/generic';
import type { SightSource } from '../../vision/sight';
import type { VisionCone } from '../../vision/visionCone';

/** One range of a token, as the GM's overlay draws it. */
export interface SenseRing {
  /** The sense's name and how far it reaches, e.g. "Darkvision 60ft". */
  label: string;
  /** World pixels. */
  radius: number;
  /** A sense of the eyes of a token that looks one way: only the arc within the cone is drawn. */
  cone?: VisionCone;
  /** `sight`: a solid line. `sense`: dashed. `creatures`: dotted, for a sense that shows no map. */
  style: 'sight' | 'sense' | 'creatures';
}

export interface SenseRings {
  center: { x: number; y: number };
  rings: SenseRing[];
  /** Where the token looks, drawn as two edges as far as `coneReach`. */
  cone?: VisionCone;
  /** How far the eyes of a token that looks one way see, in world pixels: `unlimited` without a sight range, 0 without a cone or without eyes that see. */
  coneReach: number;
}

/**
 * The ranges of a vision token for the GM: a ring for its sight and for each sense that has a
 * distance, widest first; what reaches without limit has none. They show how far each reaches,
 * not what walls leave of it. `unlimited` is the reach of a sense without a distance (the map's
 * diagonal); `distance` words a world radius ("60ft", or a range band).
 */
export function senseRings(source: SightSource, unlimited: number, distance: (radius: number) => string): SenseRings {
  const rings: SenseRing[] = [];
  const add = (name: string, reach: number, eyes: boolean, style: SenseRing['style']): void => {
    const radius = eyes ? Math.min(reach, source.range) : reach;
    if (radius <= 0 || radius >= unlimited) return;
    rings.push({ label: `${name} ${distance(radius)}`, radius, ...(eyes && source.cone && { cone: source.cone }), style });
  };
  if (!source.blinded) add(NORMAL_SIGHT.name, source.range, true, 'sight');
  for (const { definition, range } of source.senses) {
    add(definition.name, range, !definition.worksWhileBlinded, showsMap(definition) ? 'sense' : 'creatures');
  }
  rings.sort((a, b) => b.radius - a.radius);
  const looks = source.cone && !source.blinded;
  return { center: source.origin, rings, ...(looks && { cone: source.cone }), coneReach: looks ? Math.max(0, Math.min(source.range, unlimited)) : 0 };
}
