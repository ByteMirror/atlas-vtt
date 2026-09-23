import React from 'react';
import { Button } from './button';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  /** Names the choice for assistive technology. */
  ariaLabel: string;
  className?: string;
}

/** A row of mutually exclusive choices, one of them active. */
export function SegmentedControl<T extends string>({ value, options, onChange, ariaLabel, className }: SegmentedControlProps<T>): React.JSX.Element {
  return (
    <div className={`atlas-segmented${className ? ` ${className}` : ''}`} role="radiogroup" aria-label={ariaLabel}>
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
