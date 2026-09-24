import React from 'react';
import { cn } from '../../../../utils/cn';
import { MAX_NUMBER_KEY } from './sceneSwitcherSearch';

interface SceneSwitcherFooterProps {
  /** Lifts the footer off the list while more maps are scrolled out of view below it. */
  isRaised: boolean;
}

interface KeyHint {
  keys: string;
  label: string;
}

const HINTS: readonly KeyHint[] = [
  { keys: '↑↓', label: 'Navigate' },
  { keys: '↵', label: 'Open' },
  { keys: 'shift ↵', label: 'Open in both views' },
  { keys: `1–${MAX_NUMBER_KEY}`, label: 'Jump' },
  { keys: 'esc', label: 'Close' },
];

/** One line of keyboard hints. */
export function SceneSwitcherFooter({ isRaised }: SceneSwitcherFooterProps): React.ReactElement {
  return (
    <div className={cn('atlas-scene-switcher__footer', isRaised && 'atlas-scene-switcher__footer--raised')}>
      {HINTS.map((hint) => (
        <span key={hint.keys} className="atlas-scene-switcher__hint">
          <kbd>{hint.keys}</kbd>
          {hint.label}
        </span>
      ))}
    </div>
  );
}
