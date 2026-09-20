import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { DiceRollResult } from '../../../tools/DiceTool';
import { getDiceCrit } from '../../../tools/diceCrit';
import { useDiceAvatarUrl } from './useDiceAvatarUrl';

type ToastPhase = 'entering' | 'visible' | 'exiting';

interface DiceToastProps {
  result: DiceRollResult;
  phase: ToastPhase;
  onDismiss: () => void;
}

export function DiceToast({ result, phase, onDismiss }: DiceToastProps): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);

  const crit = getDiceCrit(result);
  const isCritSuccess = crit === 'high';
  const isCritFail = crit === 'low';

  const source = result.source;
  const sourceTokenName = source?.tokenName ?? 'Unknown';
  const avatarUrl = useDiceAvatarUrl(source);
  const hasSource = source?.type === 'statblock' && source.tokenName;

  const handleToggleDetails = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setIsExpanded(prev => !prev);
  };

  return (
    <div
      className={cn(
        'atlas-dice-toast',
        hasSource && 'atlas-dice-toast--has-source',
        phase === 'entering' && 'atlas-dice-toast--entering',
        phase === 'exiting' && 'atlas-dice-toast--exiting',
        isCritSuccess && 'atlas-dice-toast--crit-success',
        isCritFail && 'atlas-dice-toast--crit-fail',
      )}
      onClick={onDismiss}
    >
      {/* Avatar — top-aligned left column */}
      {hasSource && (
        avatarUrl ? (
          <img className="atlas-dice-toast__avatar" src={avatarUrl} alt={sourceTokenName} />
        ) : (
          <div className="atlas-dice-toast__avatar atlas-dice-toast__avatar--fallback">
            {sourceTokenName.charAt(0).toUpperCase()}
          </div>
        )
      )}
      <div className="atlas-dice-toast__content">
        {hasSource && (
          <span className="atlas-dice-toast__name">{sourceTokenName}</span>
        )}
        {source?.abilityName && (
          <span className="atlas-dice-toast__ability">{source.abilityName}</span>
        )}
        <div className="atlas-dice-toast__summary">
          <span className="atlas-dice-toast__formula">{result.formula}</span>
          <span className="atlas-dice-toast__eq">=</span>
          <span className="atlas-dice-toast__total">{result.total}</span>
        </div>
        {/* Collapsible details */}
        <div className="atlas-dice-toast__details-toggle" onClick={handleToggleDetails}>
          <ChevronDown className={cn('atlas-dice-toast__chevron', isExpanded && 'atlas-dice-toast__chevron--open')} />
          <span className="atlas-dice-toast__details-label">Details</span>
        </div>
        {isExpanded && (
          <div className="atlas-dice-toast__details">
            {result.rolls.map((roll, i) => (
              <span
                key={i}
                className={cn(
                  'atlas-dice-toast__die-badge',
                  roll.value === roll.max && 'atlas-dice-toast__die-badge--max',
                  roll.value === 1 && 'atlas-dice-toast__die-badge--min',
                )}
              >
                {roll.die}: {roll.value}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
