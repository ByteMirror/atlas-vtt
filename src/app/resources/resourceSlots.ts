import { MAX_RESOURCES, type ResourceDefinition } from './resourceTypes';

/** A resource with the socket it takes on a token. */
export interface SlottedResource {
  definition: ResourceDefinition;
  slot: number;
}

/** Whether `slot` names one of a token's sockets. */
export function isSocket(slot: unknown): slot is number {
  return typeof slot === 'number' && Number.isInteger(slot) && slot >= 0 && slot < MAX_RESOURCES;
}

/**
 * Each resource with its socket, in socket order. A stored socket holds (the first to claim
 * it); a resource without one, or whose socket is taken, gets the first free socket in list
 * order, so presets and lists stored without sockets read as their order. What finds no
 * socket is left out: a token has `MAX_RESOURCES` of them.
 */
export function slottedResources(definitions: readonly ResourceDefinition[]): SlottedResource[] {
  const sockets = new Map<number, ResourceDefinition>();
  const waiting: ResourceDefinition[] = [];
  for (const definition of definitions) {
    if (isSocket(definition.slot) && !sockets.has(definition.slot)) sockets.set(definition.slot, definition);
    else waiting.push(definition);
  }
  for (let slot = 0; slot < MAX_RESOURCES && waiting.length > 0; slot++) {
    if (!sockets.has(slot)) sockets.set(slot, waiting.shift()!);
  }
  return [...sockets].sort(([a], [b]) => a - b).map(([slot, definition]) => ({ definition, slot }));
}
