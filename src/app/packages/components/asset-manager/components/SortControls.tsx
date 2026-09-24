import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import type { SortOption } from '../types';
import type { SelectionState } from '../hooks/useSelectionHandlers';
import { SORT_LABELS } from '../utils/assetSort';
import { HeaderMenu } from './HeaderMenu';

const ALL_SORT_OPTIONS = Object.keys(SORT_LABELS) as SortOption[];

export type SortControlsProps = Pick<SelectionState, 'sortBy' | 'sortOptions' | 'setSortBy' | 'sortOrder' | 'setSortOrder'>;

/**
 * Sort field and order. Wide headers show the field as a button that cycles
 * through the options next to an order button; narrow ones fold both into one
 * menu (the header's container queries pick one).
 */
export function SortControls({ sortBy, sortOptions, setSortBy, sortOrder, setSortOrder }: SortControlsProps): React.JSX.Element {
  const cycleSort = (): void => {
    setSortBy(sortOptions[(sortOptions.indexOf(sortBy) + 1) % sortOptions.length]!);
  };

  return (
    <>
      <div className="atlas-am-sort-inline">
        <LabelTooltip label={`Sort by ${SORT_LABELS[sortBy]} (click to change)`}>
          <Button variant="ghost" className="atlas-am-sort" onClick={cycleSort}>
            {/* Every label is rendered in the same cell so the button is always as wide as the longest one */}
            <span className="atlas-am-sort-stack">
              {ALL_SORT_OPTIONS.map((option) => (
                <span key={option} aria-hidden={option !== sortBy} className={option === sortBy ? 'atlas-current' : ''}>
                  {SORT_LABELS[option]}
                </span>
              ))}
            </span>
          </Button>
        </LabelTooltip>
        <LabelTooltip label={sortOrder === 'asc' ? 'Ascending' : 'Descending'}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-am-icon-btn"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </LabelTooltip>
      </div>

      <HeaderMenu
        className="atlas-am-sort-menu"
        label={`Sort by ${SORT_LABELS[sortBy]}, ${sortOrder === 'asc' ? 'ascending' : 'descending'}`}
        triggerClassName="atlas-am-icon-btn"
        iconTrigger
        triggerContent={<ArrowUpDown />}
        items={[
          ...sortOptions.map((option) => ({
            key: option,
            label: SORT_LABELS[option],
            checked: option === sortBy,
            onSelect: () => setSortBy(option),
          })),
          { key: 'asc', label: 'Ascending', checked: sortOrder === 'asc', separated: true, onSelect: () => setSortOrder('asc') },
          { key: 'desc', label: 'Descending', checked: sortOrder === 'desc', onSelect: () => setSortOrder('desc') },
        ]}
      />
    </>
  );
}
