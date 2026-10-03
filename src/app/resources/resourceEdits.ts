import { clampValue, startingValue } from './resourceValues';
import type { ResourceDefinition, ResourceHolder, ResourceValue } from './resourceTypes';

export interface ResourceMaxInput {
  definition: ResourceDefinition;
  /** undefined: follow the statblock (or remove the resource when the statblock has none). */
  max: number | undefined;
}

/** The token update for the maxima typed into Edit Token. */
export function buildResourceEdits(
  token: ResourceHolder,
  inputs: readonly ResourceMaxInput[],
  defaults: Record<string, ResourceValue>,
): { resources: Record<string, ResourceValue>; overriddenMax: string[] | undefined } {
  const resources: Record<string, ResourceValue> = { ...token.resources };
  const overridden = new Set(token.overriddenMax ?? []);
  for (const { definition, max } of inputs) {
    const { key } = definition;
    const current = resources[key];
    const fallback = defaults[key];
    if (max === undefined) {
      overridden.delete(key);
      if (fallback) resources[key] = clampValue({ current: current?.current ?? fallback.current, max: fallback.max });
      else delete resources[key];
      continue;
    }
    // A resource the token did not have starts full or empty by its direction
    resources[key] = clampValue({ current: current?.current ?? startingValue(definition, max).current, max });
    // Back on the statblock's value: follow it again. A new value: set by hand. Unchanged: as it was.
    if (fallback?.max === max) overridden.delete(key);
    else if (current?.max !== max) overridden.add(key);
  }
  return { resources, overriddenMax: overridden.size > 0 ? [...overridden] : undefined };
}
