import React from 'react';
import { FileWarning } from 'lucide-react';
import { CoinIcon } from '../CoinIcon';
import { Button } from '../../../packages/components/primitives/button';
import { LoadingSpinner } from '../../../packages/components/primitives/LoadingSpinner';
import { t } from '../../../i18n';

interface LootEmptyStateProps {
  inCollection: boolean;
  /** Obsidian's Bases core plugin is on. */
  basesAvailable: boolean;
  loaded: boolean;
  baseCount: number;
  /** Opens the collection's loot settings. */
  onSetUp: () => void;
}

/** What the loot roller shows before it has items to roll on, and how to give it some. */
export function LootEmptyState({ inCollection, basesAvailable, loaded, baseCount, onSetUp }: LootEmptyStateProps): React.ReactElement {
  if (inCollection && basesAvailable && !loaded) {
    return (
      <div className="atlas-loot-empty">
        <LoadingSpinner size={32} />
      </div>
    );
  }

  const [title, body] = !inCollection
    ? [t('loot.empty.noCollection'), t('loot.empty.noCollectionBody')]
    : !basesAvailable
      ? [t('loot.empty.basesOff'), t('loot.empty.basesOffBody')]
      : baseCount === 0
        ? [t('loot.empty.noBases'), t('loot.empty.noBasesBody')]
        : [t('loot.empty.noItems'), t('loot.empty.noItemsBody')];

  return (
    <div className="atlas-loot-empty">
      <span className="atlas-loot-empty__icon">{baseCount > 0 || !basesAvailable ? <FileWarning /> : <CoinIcon />}</span>
      <p className="atlas-loot-empty__title">{title}</p>
      <p className="atlas-loot-empty__body">{body}</p>
      {inCollection && basesAvailable && (
        <Button variant={baseCount === 0 ? 'default' : 'outline'} className="atlas-loot-empty__action" onClick={onSetUp}>
          {baseCount === 0 ? t('loot.empty.setUp') : t('loot.empty.settings')}
        </Button>
      )}
    </div>
  );
}
