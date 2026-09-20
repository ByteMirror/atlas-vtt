import React from 'react';
import { diceIcons, DiceType } from '../DiceIcons';
import { cn } from '../../../../utils/cn';

interface DiceSelection {
  [die: string]: number;
}

interface DiceGridProps {
  selection: DiceSelection;
  onAdd: (die: string, event: React.MouseEvent) => void;
  onRemove: (die: string, event: React.MouseEvent) => void;
}

const AVAILABLE_DICE: DiceType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

export function DiceGrid({ selection, onAdd, onRemove }: DiceGridProps): React.ReactElement {
  return (
    <div className="atlas-dice-grid">
      {AVAILABLE_DICE.map(die => {
        const DiceIcon = diceIcons[die];
        const count = selection[die] ?? 0;
        const isSelected = count > 0;

        return (
          <div key={die} className="atlas-dice-cell">
            <button
              className={cn('atlas-dice-btn', isSelected && 'atlas-dice-btn--selected')}
              onClick={(e) => onAdd(die, e)}
              onContextMenu={(e) => onRemove(die, e)}
              title={`${die.toUpperCase()} \u2022 Left: add \u2022 Right: remove`}
            >
              <DiceIcon size={18} />
              {isSelected && (
                <span key={count} className="atlas-dice-badge">
                  {count}
                </span>
              )}
            </button>
            <span className="atlas-dice-label">{die}</span>
          </div>
        );
      })}
    </div>
  );
}
