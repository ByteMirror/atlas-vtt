import React from 'react';
import type { ContentItem } from '../../../../services/collectionBundle/bundleContents';
import { Checkbox, itemState, withKeys, type ContentSelection } from './contentSelection';
import { VirtualGrid } from './VirtualGrid';

interface ItemGridProps {
  items: readonly ContentItem[];
  selection?: ContentSelection | undefined;
}

function ItemRow({ item, selection }: { item: ContentItem; selection?: ContentSelection | undefined }): React.JSX.Element {
  const state = itemState(selection, item.key);
  if (!selection) {
    return <div className="atlas-transfer-item" role="listitem"><span className="atlas-transfer-item__name">{item.name}</span></div>;
  }
  return (
    <div className="atlas-transfer-item" role="listitem" data-orphaned={state === 'orphaned' || undefined}>
      <label className="atlas-transfer-item__label">
        <Checkbox
          checked={state === 'included'}
          disabled={state === 'orphaned'}
          onChange={(event) => selection.onChange(withKeys(selection.excluded, [item.key], event.target.checked))}
        />
        <span className="atlas-transfer-item__name">{item.name}</span>
        {state === 'orphaned' && <span className="atlas-transfer-item__hint">Only used by content you left out</span>}
      </label>
    </div>
  );
}

/** The names of a kind's items in columns, rendered only as far as the pane shows them. */
export function ItemGrid({ items, selection }: ItemGridProps): React.JSX.Element {
  return (
    <VirtualGrid
      items={items}
      minColumnWidth={220}
      rowHeight={28}
      rowGap={0}
      columnGap={16}
      className="atlas-transfer-item-grid"
      itemKey={(item) => item.key}
      renderItem={(item) => <ItemRow item={item} selection={selection} />}
    />
  );
}
