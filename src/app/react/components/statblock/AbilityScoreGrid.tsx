import React from 'react';
import type { StatblockItem, StatblockMonster } from './statblockTypes';
import {
  abilityScores,
  MENTAL_ABILITIES,
  PHYSICAL_ABILITIES,
  type AbilityKey,
  type AbilityScore,
} from './abilityScores';
import { abilityModifier, signed } from './statblockUtils';
import { diceLinkProps } from '../../../services/statblockDiceLinks';

interface AbilityScoreGridProps {
  item: StatblockItem;
  monster: StatblockMonster;
}

/** A modifier the dice tool rolls as `1d20±n`, named so the toast reads "Strength save". */
function AbilityRoll({
  modifier,
  ability,
  proficient,
}: {
  modifier: string;
  ability: string;
  proficient?: boolean;
}): React.JSX.Element {
  return (
    <span
      {...diceLinkProps(modifier)}
      data-ability={ability}
      data-proficient={proficient ? '' : undefined}
    >
      {modifier}
    </span>
  );
}

function AbilityTable({
  scores,
  keys,
  item,
  monster,
}: AbilityScoreGridProps & { scores: AbilityScore[]; keys: readonly AbilityKey[] }): React.JSX.Element {
  const rows = keys
    .map((key) => scores.find((score) => score.key === key))
    .filter((score): score is AbilityScore => score !== undefined);

  return (
    <table className="atlas-sb-ability-table">
      <thead>
        <tr>
          <th className="atlas-sb-ability-corner" scope="col">
            <span className="atlas-sb-visually-hidden">Ability</span>
          </th>
          <th className="atlas-sb-ability-corner" scope="col">
            <span className="atlas-sb-visually-hidden">Score</span>
          </th>
          <th scope="col">Mod</th>
          <th scope="col">Save</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((score) => {
          const modifier = abilityModifier(score.score, item, monster);
          const save = score.save === null ? modifier : signed(score.save);

          return (
            <tr key={score.key}>
              <th scope="row" className="atlas-sb-ability-name">
                <abbr aria-label={score.name}>{score.label}</abbr>
              </th>
              <td className="atlas-sb-ability-score">{score.score}</td>
              <td className="atlas-sb-ability-mod">
                <AbilityRoll modifier={modifier} ability={`${score.name} check`} />
              </td>
              <td className="atlas-sb-ability-mod">
                <AbilityRoll
                  modifier={save}
                  ability={`${score.name} save`}
                  proficient={score.save !== null}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The 2024 ability grid: physical abilities beside mental ones, each row showing
 * the score, its modifier and its saving throw. Modifiers and saves roll.
 *
 * Returns null for creatures without six ability scores, so the caller can fall
 * back to the plain table.
 */
export function AbilityScoreGrid({ item, monster }: AbilityScoreGridProps): React.JSX.Element | null {
  const scores = abilityScores(monster);
  if (!scores) return null;

  return (
    <div className="atlas-sb-abilities">
      <AbilityTable scores={scores} keys={PHYSICAL_ABILITIES} item={item} monster={monster} />
      <AbilityTable scores={scores} keys={MENTAL_ABILITIES} item={item} monster={monster} />
    </div>
  );
}
