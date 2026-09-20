import React, { useRef, useState } from 'react';
import { openContextMenuGlobal } from '../../../react/root/ContextMenuContext';
import type { ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';

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
  const buttonRef = useRef<HTMLDivElement>(null);
  const [, setIsOpen] = useState(false);

  const handleClick = (e: React.MouseEvent | React.KeyboardEvent): void => {
    e.preventDefault();
    e.stopPropagation();

    if (!buttonRef.current) return;

    let entries: ContextMenuEntry[];

    if (Array.isArray(options)) {
      entries = (options as readonly string[]).map((option) => ({
        type: 'item' as const,
        label: formatOptionLabel(option),
        checked: value === option,
        onClick: () => {
          onChange(option);
          setIsOpen(false);
        },
      }));
    } else {
      entries = Object.entries(options as Record<string, string>).map(([key, display]) => ({
        type: 'item' as const,
        label: formatOptionLabel(display),
        checked: value === key,
        onClick: () => {
          onChange(key);
          setIsOpen(false);
        },
      }));
    }

    const rect = buttonRef.current.getBoundingClientRect();
    openContextMenuGlobal(entries, { x: rect.left, y: rect.bottom });
    setIsOpen(true);
  };

  // Get display value
  let displayValue = value;
  if (!Array.isArray(options) && value) {
    displayValue = (options as Record<string, string>)[value] || value;
  }
  
  return (
    <div 
      ref={buttonRef}
      className={`text-icon-button ${className || ''}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      }}
      tabIndex={0}
    >
      <span className="text-button-label">
        {displayValue || placeholder || 'Select...'}
      </span>
      <span className="text-button-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-chevron-down">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
    </div>
  );
};
