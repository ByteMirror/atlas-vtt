/**
 * ConditionsTab — CRUD list of user-defined token conditions with their badge colour and icon.
 */

import React, { useState } from 'react';
import { Hash, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import { conditionGlyph } from '../../../utils/conditionGlyph';
import { WidgetIconPicker } from '../WidgetIconPicker';
import { ConditionBadgePreview } from './ConditionBadgePreview';

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
  const [iconPickerId, setIconPickerId] = useState<string | null>(null);

  const updateCondition = (
    index: number,
    partial: Partial<ConditionDefinition>,
  ): void => {
    const updated = conditions.map((c, i) =>
      i === index ? { ...c, ...partial } : c,
    );
    onChange(updated);
  };

  const clearIcon = (index: number): void => {
    onChange(conditions.map((c, i) => {
      if (i !== index) return c;
      const { icon: _icon, ...rest } = c;
      return rest;
    }));
  };

  const addCondition = (): void => {
    const newCondition: ConditionDefinition = {
      id: crypto.randomUUID(),
      name: '',
      color: randomColor(),
    };
    onChange([...conditions, newCondition]);
  };

  const toggleValued = (index: number): void => {
    onChange(conditions.map((c, i) => {
      if (i !== index) return c;
      if (!c.valued) return { ...c, valued: true };
      const { valued: _valued, ...rest } = c;
      return rest;
    }));
  };

  const removeCondition = (index: number): void => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <>
      <p className="atlas-csm-hint">
        Define conditions that can be toggled on tokens. Each one shows as a badge
        on the token&apos;s edge, and hovering the token lists them by name. Click a
        badge to give it an icon, and turn on # for conditions that carry a number,
        like Frightened 2.
      </p>

      {conditions.length > 0 ? (
        <div className="atlas-csm-condition-list">
          {conditions.map((cond, i) => (
            <div key={cond.id} className="atlas-csm-condition">
              <div className="atlas-csm-condition-row">
                <LabelTooltip label="Choose icon">
                  <button
                    type="button"
                    className="atlas-csm-condition-badge-button"
                    aria-expanded={iconPickerId === cond.id}
                    onClick={() => setIconPickerId(iconPickerId === cond.id ? null : cond.id)}
                  >
                    <ConditionBadgePreview condition={cond} size={24} />
                  </button>
                </LabelTooltip>
                <input
                  type="text"
                  className="atlas-csm-input"
                  placeholder="Condition name"
                  value={cond.name}
                  onChange={(e) => updateCondition(i, { name: e.target.value })}
                />
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
                <LabelTooltip label={cond.valued ? 'Carries a number, like Frightened 2' : 'Give it a number, like Frightened 2'}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-csm-condition-valued"
                    aria-pressed={!!cond.valued}
                    onClick={() => toggleValued(i)}
                  >
                    <Hash />
                  </Button>
                </LabelTooltip>
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
              {iconPickerId === cond.id && (
                <WidgetIconPicker
                  label="Condition icon"
                  value={cond.icon}
                  color={cond.color}
                  onChange={(icon) => updateCondition(i, { icon })}
                  noIcon={{
                    label: 'Initial',
                    content: <span className="atlas-csm-condition-initial">{glyphInitial(cond)}</span>,
                    onSelect: () => clearIcon(i),
                  }}
                />
              )}
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

/** The letter a condition's badge shows while it has no icon. */
function glyphInitial(condition: ConditionDefinition): string {
  const glyph = conditionGlyph({ name: condition.name });
  return glyph.kind === 'text' ? glyph.text : '';
}
