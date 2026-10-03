import { perceivedLevel } from '../gameSystems/senseRules';
import type { Point } from '../types/visionTypes';
import { darknessAt, lightLevelAt } from './lightLevels';
import type { AmbientLight, LightReach, SightSource } from './sight';

/**
 * Whether a light whose flame stands at `point` is put out by magical darkness: a darkness
 * source covers the flame and the light does not outrank it. Such a light gives nothing, inside
 * the darkness or beyond it (nonmagical light cannot illuminate magical darkness, and a flame in
 * it is not seen from outside). A darkness is never put out.
 */
export function quenched(point: Point, priority: number, lights: readonly LightReach[]): boolean {
  return darknessAt(point, lights) >= priority;
}

/**
 * The vision tokens as they see with the lights of the scene: one that stands in magical
 * darkness has no sight of the eyes at all, in the darkness or out of it, unless a sense of its
 * eyes sees in magical darkness; its senses that need no eyes work as ever. The same list while
 * no token stands in one.
 */
export function sourcesInDarkness(sources: SightSource[], ambient: AmbientLight, lights: readonly LightReach[]): SightSource[] {
  if (!lights.some((light) => light.darkness)) return sources;
  return sources.map((source) => {
    if (lightLevelAt(source.origin, ambient, lights) !== 'magical-dark') return source;
    const senses = source.senses.filter(({ definition }) => definition.worksWhileBlinded || perceivedLevel(definition, 'magical-dark') !== null);
    const { seesInvisible, ...rest } = source;
    // Eyes that see invisible things see them only through a sense that still sees.
    const eyes = senses.some(({ definition }) => !definition.worksWhileBlinded);
    return { ...rest, senses, blinded: true as const, ...(seesInvisible && eyes && { seesInvisible }) };
  });
}
