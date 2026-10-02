import React, { useRef, useState } from 'react';
import type { FacetOption } from '../../../../../creatures/creatureFilterEngine';
import type { OptionState } from '../../../../../types/creatureFilterTypes';
import { Button } from '../../../primitives/button';
import { t } from '../../../../../i18n';

interface OptionChipsProps {
  options: readonly FacetOption[];
  /** Names the group for assistive technology. */
  label: string;
  onChange: (key: string, state: OptionState) => void;
}

/** Chips shown before "Show all". */
const COLLAPSED_COUNT = 12;

const excluding = (state: OptionState): OptionState => (state === 'exclude' ? null : 'exclude');

/**
 * The options of a filter as chips with counts. A click requires an option or
 * clears it; a double-click (or Alt-click) excludes it or clears the exclusion.
 * Options no asset in view has are dimmed but stay pickable; the list folds
 * after the most common ones, but never hides a picked option.
 */
export function OptionChips({ options, label, onChange }: OptionChipsProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  // A double-click's first click has already toggled the chip; it decides from the state before.
  const beforeFirstClick = useRef(new Map<string, OptionState>());
  const foldable = options.length > COLLAPSED_COUNT + 2;
  const shown = !foldable || expanded
    ? options
    : options.filter((option, index) => index < COLLAPSED_COUNT || option.state !== null);

  const click = (option: FacetOption, event: React.MouseEvent): void => {
    if (event.detail > 1) return;
    beforeFirstClick.current.set(option.key, option.state);
    onChange(option.key, event.altKey ? excluding(option.state) : option.state === null ? 'include' : null);
  };

  const doubleClick = (option: FacetOption): void => {
    onChange(option.key, excluding(beforeFirstClick.current.get(option.key) ?? option.state));
  };

  return (
    <div className="atlas-filter-chips" role="group" aria-label={label}>
      {shown.map((option) => (
        <Button
          key={option.key}
          variant="ghost"
          className={`atlas-filter-chip${option.state === 'include' ? ' atlas-active' : ''}${option.state === 'exclude' ? ' atlas-excluded' : ''}${option.count === 0 ? ' atlas-empty' : ''}`}
          aria-pressed={option.state === 'include'}
          aria-label={`${option.label}, ${option.count}${option.state === 'exclude' ? ', excluded' : ''}`}
          onClick={(event) => click(option, event)}
          onDoubleClick={() => doubleClick(option)}
        >
          <span className="atlas-filter-chip__label">{option.label}</span>
          <span className="atlas-filter-chip__count">{option.count}</span>
        </Button>
      ))}
      {foldable && (
        <Button variant="ghost" className="atlas-filter-chips__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? t('filters.showFewer') : t('filters.showAll', { count: options.length })}
        </Button>
      )}
    </div>
  );
}
