import { GENERIC_SENSES } from '../../gameSystems/senses';
import type { SenseSource } from '../sight';

/** The generic sense `id` reaching `range` world pixels, as a token's sight source carries it. */
export function senseSource(id: string, range: number): SenseSource {
  const definition = GENERIC_SENSES.find((sense) => sense.id === id);
  if (!definition) throw new Error(`No generic sense ${id}`);
  return { definition, range };
}

export const darkvision = (range: number): SenseSource => senseSource('darkvision', range);
export const tremorsense = (range: number): SenseSource => senseSource('tremorsense', range);
