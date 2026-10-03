import { parseResourceValue, resolveField } from './resourceFields';
import type { ResourceDefinition, ResourceValue } from './resourceTypes';

/** The starting value a statblock gives one resource, or null when its field holds no quantity. */
export function statblockResourceValue(
  record: Readonly<Record<string, unknown>>,
  definition: ResourceDefinition,
): ResourceValue | null {
  // A bare maximum starts full or empty by direction; a stated current ("12/27") is kept.
  const parsed = parseResourceValue(resolveField(record, definition.field), definition.direction === 'fills');
  return parsed && parsed.max > 0 ? parsed : null;
}

export function startingResources(
  record: Readonly<Record<string, unknown>>,
  definitions: readonly ResourceDefinition[],
): Record<string, ResourceValue> {
  const values: Record<string, ResourceValue> = {};
  for (const definition of definitions) {
    const value = statblockResourceValue(record, definition);
    if (value) values[definition.key] = value;
  }
  return values;
}
