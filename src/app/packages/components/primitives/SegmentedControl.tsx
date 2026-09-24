import React, { useId } from 'react';
import { Button } from './button';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Names the choice for assistive technology, without the hover tooltip Obsidian adds for `aria-label`. */
  ariaLabel: string;
  className?: string;
}

/** A row of mutually exclusive choices, one of them active. */
export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel, className }: SegmentedControlProps<T>): React.JSX.Element {
  const labelId = useId();
  return (
    <div className={`atlas-segmented${className ? ` ${className}` : ''}`} role="radiogroup" aria-labelledby={labelId}>
      <span id={labelId} hidden>{ariaLabel}</span>
      {options.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          role="radio"
          aria-checked={option.value === value}
          className={`atlas-segmented__option${option.value === value ? ' atlas-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
