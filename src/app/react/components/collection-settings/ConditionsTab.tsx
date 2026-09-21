/**
 * ConditionsTab — CRUD list of user-defined token conditions with colour swatches.
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';

interface ConditionsTabProps {
  conditions: ConditionDefinition[];
  onChange: (conditions: ConditionDefinition[]) => void;
}

/** Generate a random hex colour string. */
function randomColor(): string {
  const hex = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `#${hex}`;
}

export function ConditionsTab({
  conditions,
  onChange,
}: ConditionsTabProps): React.ReactElement {
  const updateCondition = (
    index: number,
    partial: Partial<ConditionDefinition>,
  ): void => {
    const updated = conditions.map((c, i) =>
      i === index ? { ...c, ...partial } : c,
    );
    onChange(updated);
  };

  const addCondition = (): void => {
    const newCondition: ConditionDefinition = {
      id: crypto.randomUUID(),
      name: '',
      color: randomColor(),
    };
    onChange([...conditions, newCondition]);
  };

  const removeCondition = (index: number): void => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <>
      <p className="atlas-csm-hint">
        Define conditions that can be toggled on tokens. Each condition shows as
        a coloured dot underneath the token.
      </p>

      {conditions.length > 0 ? (
        <div className="atlas-csm-condition-list">
          {conditions.map((cond, i) => (
            <div key={cond.id} className="atlas-csm-condition-row">
              <div
                className="atlas-csm-color-swatch"
                style={{ backgroundColor: cond.color }}
              >
                <LabelTooltip label="Pick condition colour">
                  <input
                    type="color"
                    value={cond.color}
                    onChange={(e) => updateCondition(i, { color: e.target.value })}
                  />
                </LabelTooltip>
              </div>
              <input
                type="text"
                className="atlas-csm-input"
                placeholder="Condition name"
                value={cond.name}
                onChange={(e) => updateCondition(i, { name: e.target.value })}
              />
              <LabelTooltip label="Remove condition">
                <Button
                  variant="ghost"
                  size="icon"
                  className="atlas-csm-condition-delete"
                  onClick={() => removeCondition(i)}
                >
                  <Trash2 />
                </Button>
              </LabelTooltip>
            </div>
          ))}
        </div>
      ) : (
        <div className="atlas-csm-empty">No conditions defined</div>
      )}

      <Button variant="ghost" className="atlas-csm-add-btn" onClick={addCondition}>
        <Plus />
        Add Condition
      </Button>
    </>
  );
}
