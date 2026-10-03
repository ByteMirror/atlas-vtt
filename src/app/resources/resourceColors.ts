import type { ResourceDefinition, ResourceValue } from './resourceTypes';

/** Below these shares of what is left, a resource that defeats its token turns yellow, then red. */
const WARN_BELOW = 0.7;
const CRITICAL_BELOW = 0.3;
const WARN_COLOR = '#eab308';
const CRITICAL_COLOR = '#ef4444';

/** The share of a resource that is left: what remains of a draining one, what is not yet used of a filling one. */
export function remainingShare(definition: ResourceDefinition, value: ResourceValue): number {
  if (!(value.max > 0)) return 0;
  const share = Math.max(0, Math.min(1, value.current / value.max));
  return definition.direction === 'drains' ? share : 1 - share;
}

/**
 * The colour a resource shows in, as `#rrggbb`. A resource that defeats its token when
 * spent warns as it runs low: its own colour, yellow below 70%, red below 30%. Every
 * other resource keeps its colour.
 */
export function resourceColor(definition: ResourceDefinition, value: ResourceValue): string {
  if (!definition.defeatedWhenSpent) return definition.color;
  const left = remainingShare(definition, value);
  if (left >= WARN_BELOW) return definition.color;
  return left >= CRITICAL_BELOW ? WARN_COLOR : CRITICAL_COLOR;
}

/**
 * The colours a resource may have, around the colour wheel and ending in two neutrals. Each
 * reads on the dark track of a bar or wheel and apart from its neighbours. The warning
 * yellow and red above are left out, so a low resource never looks like another one.
 */
export const RESOURCE_COLORS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '#dc2626', label: 'Red' },
  { value: '#f43f5e', label: 'Rose' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#d946ef', label: 'Fuchsia' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#0ea5e9', label: 'Sky' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#22c55e', label: 'Green' },
  { value: '#84cc16', label: 'Lime' },
  { value: '#facc15', label: 'Yellow' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#f97316', label: 'Orange' },
  { value: '#b45309', label: 'Brown' },
  { value: '#94a3b8', label: 'Steel' },
  { value: '#e5e7eb', label: 'White' },
];
