import React from 'react';
import { Dices, X } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';

interface DiceSelection {
  [die: string]: number;
}

interface DiceFormulaBarProps {
  selection: DiceSelection;
  onClear: () => void;
  onRoll: () => void;
}

function buildFormula(selection: DiceSelection): string {
  return Object.entries(selection)
    .filter(([, count]) => count > 0)
    .map(([die, count]) => (count > 1 ? `${count}${die}` : die))
    .join(' + ');
}

export function DiceFormulaBar({ selection, onClear, onRoll }: DiceFormulaBarProps): React.ReactElement {
  const formula = buildFormula(selection);
  const hasSelection = formula.length > 0;

  return (
    <div className="atlas-dice-formula-bar">
      <span className="atlas-dice-formula-text">
        {hasSelection ? formula : 'Select dice to roll'}
      </span>
      <div className="atlas-dice-formula-actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          title="Clear selection"
          disabled={!hasSelection}
        >
          <X size={14} />
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onRoll}
          title="Roll dice"
          disabled={!hasSelection}
        >
          <Dices size={14} />
          Roll
        </Button>
      </div>
    </div>
  );
}
