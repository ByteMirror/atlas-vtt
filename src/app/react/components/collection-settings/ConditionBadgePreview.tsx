import React from 'react';
import { cn } from '../../../../utils/cn';
import { hexToNumber } from '../../../styles/designTokens';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import { conditionGlyph, isLightBadgeColor } from '../../../utils/conditionGlyph';
import { WidgetIconGlyph } from '../WidgetIconGlyph';
import './condition-badge.scss';

interface ConditionBadgePreviewProps {
  condition: Pick<ConditionDefinition, 'name' | 'color' | 'icon'>;
  size: number;
}

/** The condition's badge as tokens show it on the map. */
export function ConditionBadgePreview({ condition, size }: ConditionBadgePreviewProps): React.ReactElement {
  const glyph = conditionGlyph(condition);
  const style = { '--atlas-condition-color': condition.color, width: size, height: size, fontSize: size * 0.5 } as React.CSSProperties;
  return (
    <span
      className={cn('atlas-condition-badge', isLightBadgeColor(hexToNumber(condition.color)) && 'atlas-condition-badge--light')}
      style={style}
      aria-hidden="true"
    >
      {glyph.kind === 'icon' ? <WidgetIconGlyph icon={glyph.icon} size={Math.round(size * 0.62)} /> : glyph.text}
    </span>
  );
}
