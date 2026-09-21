import React, { useId, useState } from 'react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { WIDGET_ICONS, resolveWidgetIcon, type WidgetIcon } from '../../../types/widgetIcons';
import type { WidgetType } from '../../../types/widgetTypes';
import { WidgetIconGlyph } from '../WidgetIconGlyph';

export interface WidgetDraft {
  type: WidgetType;
  label: string;
  icon: WidgetIcon;
  color: string;
}

interface WidgetEditorFormProps {
  /** Existing widget values when editing; omitted when creating. */
  initial?: Partial<WidgetDraft>;
  submitLabel: string;
  onSubmit: (draft: WidgetDraft) => void;
  onCancel: () => void;
}

const WIDGET_TYPES: { type: WidgetType; label: string }[] = [
  { type: 'counter', label: 'Counter' },
  { type: 'timer', label: 'Timer' },
];

const DEFAULT_COLOR = '#ffc107';

export function WidgetEditorForm({ initial, submitLabel, onSubmit, onCancel }: WidgetEditorFormProps): React.ReactElement {
  const isNew = !initial;
  const [type, setType] = useState<WidgetType>(initial?.type ?? 'counter');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState<WidgetIcon>(resolveWidgetIcon(initial?.icon));
  const [color, setColor] = useState(initial?.color ?? DEFAULT_COLOR);
  const typeLabelId = useId();
  const nameLabelId = useId();
  const iconLabelId = useId();

  const trimmedLabel = label.trim();

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!trimmedLabel) return;
    onSubmit({ type, label: trimmedLabel, icon, color });
  };

  return (
    <form className="atlas-widget-editor" onSubmit={submit}>
      {isNew && (
        <div className="atlas-widget-editor-types" role="radiogroup" aria-labelledby={typeLabelId}>
          <span id={typeLabelId} hidden>Widget type</span>
          {WIDGET_TYPES.map((option) => (
            <Button
              key={option.type}
              type="button"
              size="sm"
              variant={type === option.type ? 'default' : 'outline'}
              role="radio"
              aria-checked={type === option.type}
              onClick={() => setType(option.type)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      <div className="atlas-widget-editor-name-row">
        <span id={nameLabelId} hidden>Widget name</span>
        <input
          type="text"
          className="atlas-setting-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Widget name"
          aria-labelledby={nameLabelId}
          maxLength={24}
          autoFocus
        />
        <LabelTooltip label="Widget colour">
          <input
            type="color"
            className="atlas-widget-editor-color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </LabelTooltip>
      </div>

      <div className="atlas-widget-editor-icons" role="radiogroup" aria-labelledby={iconLabelId}>
        <span id={iconLabelId} hidden>Widget icon</span>
        {WIDGET_ICONS.map((name) => (
          <LabelTooltip key={name} label={name}>
            <button
              type="button"
              role="radio"
              aria-checked={icon === name}
              className={cn('atlas-widget-editor-icon', icon === name && 'atlas-active')}
              style={icon === name ? { color } : undefined}
              onClick={() => setIcon(name)}
            >
              <WidgetIconGlyph icon={name} size={20} />
            </button>
          </LabelTooltip>
        ))}
      </div>

      <div className="atlas-widget-editor-actions">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="default" size="sm" disabled={!trimmedLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
