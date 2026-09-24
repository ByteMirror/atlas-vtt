import React, { useId, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';

export interface HeaderSearchProps {
  search: string;
  onSearch: (value: string) => void;
}

/**
 * The asset search. On narrow headers it collapses to a button; the field then
 * opens over the toolbar row while it has focus (see `_header.scss`), so
 * Cmd/Ctrl+F opens it as well.
 */
export function HeaderSearch({ search, onSearch }: HeaderSearchProps): React.JSX.Element {
  const labelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    // Collapsed, Escape closes the field first instead of the whole asset manager.
    if (event.key !== 'Escape' || toggleRef.current?.offsetParent == null) return;
    event.preventDefault();
    event.stopPropagation();
    inputRef.current?.blur();
  };

  return (
    <div className="atlas-am-search">
      <LabelTooltip label={search ? `Search: ${search}` : 'Search'}>
        <Button
          ref={toggleRef}
          variant="ghost"
          size="icon"
          className={`atlas-am-icon-btn atlas-am-search-toggle ${search ? 'atlas-active' : ''}`}
          onClick={() => inputRef.current?.focus()}
          aria-label="Search"
        >
          <Search />
        </Button>
      </LabelTooltip>

      <div className="atlas-asset-manager-search">
        <Search />
        <span id={labelId} hidden>Search assets</span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          placeholder="Search…"
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-labelledby={labelId}
        />
        {search && (
          <LabelTooltip label="Clear search">
            <Button
              variant="ghost"
              size="icon"
              className="atlas-am-icon-btn"
              // Keeps focus in the field, which keeps a collapsed search open.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSearch('')}
            >
              <X />
            </Button>
          </LabelTooltip>
        )}
      </div>
    </div>
  );
}
