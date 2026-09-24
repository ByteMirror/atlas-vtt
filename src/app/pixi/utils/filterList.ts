import type { Container, Filter } from 'pixi.js';

/** PIXI types `filters` as a single filter or an array; normalise to an array. */
function toFilterArray(filters: Filter | Filter[] | null | undefined): Filter[] {
  return filters ? [filters].flat() : [];
}

/** Appends `filter` to `target`'s filters, keeping any others. */
export function addFilter(target: Container, filter: Filter): void {
  const filters = toFilterArray(target.filters);
  if (!filters.includes(filter)) target.filters = [...filters, filter];
}

/** Removes `filter` from `target`'s filters, keeping any others. */
export function removeFilter(target: Container, filter: Filter): void {
  target.filters = toFilterArray(target.filters).filter((existing) => existing !== filter);
}
