import React, { useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { useScrollActivity } from '../../primitives/useScrollActivity';
import { useScrollbarGutter } from '../../primitives/useScrollbarGutter';
import type { StatblockEntry } from './statblockEntries';

interface StatblockListProps {
  id: string;
  labelId: string;
  entries: readonly StatblockEntry[];
  activePath: string | null;
  linkedPath: string | null;
  optionId: (index: number) => string;
  onActivate: (path: string) => void;
  onChoose: (path: string) => void;
  /** Shown instead of the rows when there are none. */
  empty: React.ReactNode;
}

/**
 * The creatures to choose from, driven by the search field (a combobox whose
 * active option is `activePath`). A click selects a creature, a double click links it.
 */
export function StatblockList({
  id,
  labelId,
  entries,
  activePath,
  linkedPath,
  optionId,
  onActivate,
  onChoose,
  empty,
}: StatblockListProps): React.JSX.Element {
  // State rather than a ref: the scroll hooks need the element once it exists.
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const hasScrolled = useRef(false);
  useScrollActivity(list);
  useScrollbarGutter(list);

  // The first time centres the linked creature; later moves only reveal the active row.
  useEffect(() => {
    const row = list?.querySelector('[aria-selected="true"]');
    if (!row) return;
    row.scrollIntoView({ block: hasScrolled.current ? 'nearest' : 'center' });
    hasScrolled.current = true;
  }, [list, activePath]);

  return (
    <div
      ref={setList}
      id={id}
      role="listbox"
      aria-labelledby={labelId}
      className="atlas-statblock-link__list"
      // Clicks keep focus in the search field, which drives the list.
      onMouseDown={(event) => event.preventDefault()}
    >
      {entries.length === 0 ? <div className="atlas-statblock-link__list-empty">{empty}</div> : entries.map((entry, index) => (
        <div
          key={entry.path}
          id={optionId(index)}
          role="option"
          aria-selected={entry.path === activePath}
          className="atlas-statblock-link__option"
          onClick={() => onActivate(entry.path)}
          onDoubleClick={() => onChoose(entry.path)}
        >
          <span className="atlas-statblock-link__option-text">
            <span className="atlas-statblock-link__option-name">{entry.name}</span>
            <span className="atlas-statblock-link__option-detail">{entry.detail}</span>
          </span>
          {entry.path === linkedPath && (
            <span className="atlas-statblock-link__linked"><Link2 aria-hidden />Linked</span>
          )}
        </div>
      ))}
    </div>
  );
}
