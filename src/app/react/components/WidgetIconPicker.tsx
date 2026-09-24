import React, { useId } from 'react';
import { cn } from '../../../utils/cn';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { WIDGET_ICONS, type WidgetIcon } from '../../types/widgetIcons';
import { WidgetIconGlyph } from './WidgetIconGlyph';
import './widget-icon-picker.scss';

interface WidgetIconPickerProps {
  /** Accessible name of the icon group. */
  label: string;
  value: WidgetIcon | undefined;
  onChange: (icon: WidgetIcon) => void;
  /** Colour of the selected icon. */
  color?: string;
  /** Adds a first option for no icon, selected while `value` is undefined. */
  noIcon?: { label: string; content: React.ReactNode; onSelect: () => void };
}

/** Scrollable grid of the widget icon set, shared by widgets and token conditions. */
export function WidgetIconPicker({ label, value, onChange, color, noIcon }: WidgetIconPickerProps): React.ReactElement {
  const labelId = useId();

  const option = (key: string, name: string, selected: boolean, onSelect: () => void, content: React.ReactNode): React.ReactElement => (
    <LabelTooltip key={key} label={name}>
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={name}
        className={cn('atlas-icon-picker-option', selected && 'atlas-active')}
        style={selected ? { color } : undefined}
        onClick={onSelect}
      >
        {content}
      </button>
    </LabelTooltip>
  );

  return (
    <div className="atlas-icon-picker" role="radiogroup" aria-labelledby={labelId}>
      <span id={labelId} hidden>{label}</span>
      {noIcon && option('none', noIcon.label, value === undefined, noIcon.onSelect, noIcon.content)}
      {WIDGET_ICONS.map((name) =>
        option(name, name, value === name, () => onChange(name), <WidgetIconGlyph icon={name} size={20} />),
      )}
    </div>
  );
}
