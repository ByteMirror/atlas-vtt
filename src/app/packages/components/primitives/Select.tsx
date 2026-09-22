import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../../../utils/cn';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Id of the visible label element. `aria-labelledby` keeps the name off the DOM as an attribute, so Obsidian does not turn it into a hover tooltip. */
  labelledBy: string;
  disabled?: boolean;
}

const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/** Single-choice select with Atlas styling instead of the native popup; arrow keys move, Enter picks, Escape closes. */
export function Select<T extends string>({ value, options, onChange, labelledBy, disabled = false }: SelectProps<T>): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find(option => option.value === value);

  useEffect(() => {
    if (!isOpen) return;
    rootRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const close = (): void => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const pick = (next: T): void => {
    if (next !== value) onChange(next);
    close();
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent): void => {
    const step = STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    if (isOpen) return;
    const index = options.findIndex(option => option.value === value);
    const next = options[Math.min(options.length - 1, Math.max(0, index + step))];
    if (next) onChange(next.value);
  };

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = STEP[event.key];
    if (step !== undefined) {
      event.preventDefault();
      buttons[Math.min(buttons.length - 1, Math.max(0, current + step))]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    }
  };

  return <div ref={rootRef} className={cn('atlas-select', isOpen && 'atlas-open')}>
    <button ref={triggerRef} type="button" role="combobox" aria-labelledby={labelledBy} aria-haspopup="listbox"
      aria-expanded={isOpen} aria-controls={isOpen ? listId : undefined} disabled={disabled}
      className={cn('atlas-select-trigger', isOpen && 'atlas-open')}
      onClick={() => setIsOpen(open => !open)} onKeyDown={onTriggerKeyDown}>
      <span className="atlas-select-value">{selected?.label}</span>
      <ChevronDown aria-hidden="true" className={cn('atlas-select-chevron', isOpen && 'atlas-rotated')} />
    </button>
    {isOpen && <div id={listId} role="listbox" aria-labelledby={labelledBy} className="atlas-select-content" onKeyDown={onListKeyDown}>
      {options.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value}
        className={cn('atlas-select-option', option.value === value && 'atlas-selected')} onClick={() => pick(option.value)}>
        <span className="atlas-select-option-text">{option.label}</span>
        <Check aria-hidden="true" className="atlas-select-check" />
      </button>)}
    </div>}
  </div>;
}
