/**
 * DiceTab — The collection's default roll, critical rule and exploding dice.
 */

import React from 'react';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { isValidDefaultRoll } from '../../../gameSystems/diceRules';
import { DefaultDiceInfo } from './DefaultDiceInfo';
import { ExplodingDiceFields } from './ExplodingDiceFields';
import type { CritRule, DiceRules } from '../../../types/diceRulesTypes';

interface DiceTabProps {
  dice: DiceRules;
  onChange: (dice: DiceRules) => void;
}

const CRIT_OPTIONS: Record<CritRule, string> = {
  natural: 'Natural',
  'roll-under': 'Roll-under',
  doubles: 'Doubles',
  'high-total': 'High total',
  none: 'None',
};

const CRIT_DESCRIPTIONS: Record<CritRule, string> = {
  natural: 'The highest face is a critical success, a 1 a critical failure (natural 20 and natural 1).',
  'roll-under': 'A 1 is a critical success, the highest face a critical failure (percentile systems).',
  doubles: 'Default dice that all show the same number are a critical success (duality dice).',
  'high-total': 'Default dice that add up to their highest total or one below it are a critical success (19 or 20 on 2d10 in Draw Steel).',
  none: 'Rolls are never critical.',
};

export function DiceTab({ dice, onChange }: DiceTabProps): React.ReactElement {
  const rollValid = isValidDefaultRoll(dice.defaultRoll);

  return (
    <>
      <p className="atlas-csm-hint">
        A bonus without dice in a statblock, such as +3, is added to the default roll.
        Only the default dice of a roll can be critical.
      </p>

      <div className="atlas-csm-field">
        <div className="atlas-csm-label-row">
          <label className="atlas-csm-label" htmlFor="atlas-csm-default-roll">Default Roll</label>
          <DefaultDiceInfo defaultRoll={dice.defaultRoll} />
        </div>
        <input
          id="atlas-csm-default-roll"
          type="text"
          className="atlas-csm-input"
          placeholder="1d20"
          spellCheck={false}
          aria-invalid={!rollValid || undefined}
          value={dice.defaultRoll}
          onChange={(e) => onChange({ ...dice, defaultRoll: e.target.value })}
        />
        {!rollValid && (
          <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">
            Enter one group of dice, such as 1d20 or 2d12.
          </p>
        )}
      </div>

      <div className="atlas-csm-field">
        <label className="atlas-csm-label">Critical Rule</label>
        <ObsidianMenuDropdown
          className="atlas-setting-dropdown atlas-csm-dropdown"
          value={dice.crit}
          options={CRIT_OPTIONS}
          onChange={(value) => onChange({ ...dice, crit: value as CritRule })}
        />
        <p className="atlas-csm-hint">{CRIT_DESCRIPTIONS[dice.crit]}</p>
      </div>

      <ExplodingDiceFields dice={dice} onChange={onChange} />
    </>
  );
}
