import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { renderEntries, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { Button } from '../primitives/button';

interface ObsidianMenuDropdownProps {
  value: string;
  options: readonly string[] | Record<string, string>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const EMPTY_OPTION_LABEL = 'None';

function formatOptionLabel(label: string): string {
  const normalizedLabel = label.trim();
  return normalizedLabel.length > 0 ? label : EMPTY_OPTION_LABEL;
}

export const ObsidianMenuDropdown: React.FC<ObsidianMenuDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const close = (): void => setIsOpen(false);
  const optionEntries = Array.isArray(options)
    ? (options as readonly string[]).map((option) => [option, option] as const)
    : Object.entries(options as Record<string, string>);
  const entries: ContextMenuEntry[] = optionEntries.map(([key, label]) => ({
    type: 'item',
    label: formatOptionLabel(label),
    checked: value === key,
    onClick: () => onChange(key),
  }));

  // Get display value
  let displayValue = value;
  if (!Array.isArray(options) && value) {
    displayValue = (options as Record<string, string>)[value] || value;
  }
  
  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          className={`text-icon-button atlas-obsidian-menu-dropdown ${className || ''}`}
        >
          <span className="text-button-label">
            {displayValue || placeholder || 'Select...'}
          </span>
          <span className="text-button-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-chevron-down">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-ctx-menu--dropdown"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
        >
          {renderEntries(entries, close)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
