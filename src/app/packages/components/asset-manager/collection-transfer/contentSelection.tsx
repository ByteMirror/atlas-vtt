import React, { useEffect, useRef } from 'react';

/** Lets the user leave content out of an export. */
export interface ContentSelection {
  /** Keys the export packs: not left out, and still used by something it packs. */
  included: ReadonlySet<string>;
  /** Keys the user left out. */
  excluded: ReadonlySet<string>;
  onChange: (excluded: ReadonlySet<string>) => void;
}

/**
 * Where an item stands in an export: packed, left out by the user, or left out
 * because only content the user left out uses it. Undefined when nothing is selectable.
 */
export type ItemState = 'included' | 'excluded' | 'orphaned' | undefined;

export function itemState(selection: ContentSelection | undefined, key: string): ItemState {
  if (!selection) return undefined;
  if (selection.included.has(key)) return 'included';
  return selection.excluded.has(key) ? 'excluded' : 'orphaned';
}

export function withKeys(excluded: ReadonlySet<string>, keys: readonly string[], include: boolean): Set<string> {
  const next = new Set(excluded);
  for (const key of keys) {
    if (include) next.delete(key);
    else next.add(key);
  }
  return next;
}

export function Checkbox({ indeterminate = false, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" {...props} />;
}
