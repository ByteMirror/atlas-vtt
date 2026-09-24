import React from 'react';
import type { ConditionDefinition } from '../../../types/collectionSettingsTypes';
import { ConditionBadgePreview } from './ConditionBadgePreview';

const VISIBLE_BADGES = 5;

/** The first few condition badges, overlapping, and how many more there are. */
export function ConditionBadgeStack({ conditions }: { conditions: readonly ConditionDefinition[] }): React.ReactElement | null {
  if (conditions.length === 0) return null;
  const hidden = conditions.length - VISIBLE_BADGES;
  return (
    <span className="atlas-csm-badge-stack" aria-hidden="true">
      {conditions.slice(0, VISIBLE_BADGES).map((condition) => (
        <ConditionBadgePreview key={condition.id} condition={condition} size={18} />
      ))}
      {hidden > 0 && <span className="atlas-csm-badge-stack__more">+{hidden}</span>}
    </span>
  );
}
