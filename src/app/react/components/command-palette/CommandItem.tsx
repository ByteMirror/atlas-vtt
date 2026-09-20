import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { CommandOption } from './types';

interface CommandItemProps {
  option: CommandOption;
  isFocused: boolean;
  onMouseEnter: () => void;
}

export function CommandItem({ option, isFocused, onMouseEnter }: CommandItemProps): React.ReactElement {
  if (option.label === 'separator') {
    return <div className="atlas-command-palette-separator" />;
  }

  const handleClick = (): void => {
    // Submenu entry is handled by the parent wrapper
    if (option.hasSubmenu) return;
    option.action?.();
  };

  return (
    <button
      type="button"
      className={cn('atlas-command-item', isFocused && 'atlas-focused')}
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseEnter}
    >
      <div className="atlas-command-item-left">
        {option.isToggle ? (
          <div className="atlas-command-item-toggle">
            <div className={cn('atlas-command-item-checkbox', option.isActive && 'atlas-active')}>
              {option.isActive && <Check className="atlas-command-item-check" />}
            </div>
          </div>
        ) : (
          option.icon && <div className="atlas-command-item-icon">{option.icon}</div>
        )}
        <span className="atlas-command-item-label">{option.label}</span>
      </div>
      <div className="atlas-command-item-right">
        {option.shortcut && <kbd className="atlas-command-palette-kbd">{option.shortcut}</kbd>}
        {option.hasSubmenu && <ChevronRight className="atlas-command-item-submenu-icon" />}
      </div>
    </button>
  );
}
