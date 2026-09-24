import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, CircleUser, Clapperboard, Map as MapIcon, NotebookText, ScrollText, Swords, type LucideIcon } from 'lucide-react';
import type { ContentCategory, ContentGroup, ContentItem } from '../../../../services/collectionBundle/bundleContents';

/** Lets the user leave content out of an export. */
export interface ContentSelection {
  /** Keys the export packs: not left out, and still used by something it packs. */
  included: ReadonlySet<string>;
  /** Keys the user left out. */
  excluded: ReadonlySet<string>;
  onChange: (excluded: ReadonlySet<string>) => void;
}

interface ContentsListProps {
  groups: readonly ContentGroup[];
  /** Without a selection the list only shows what is included. */
  selection?: ContentSelection | undefined;
}

const ICONS: Record<ContentCategory, LucideIcon> = {
  scenes: Clapperboard, maps: MapIcon, tokens: CircleUser, encounters: Swords, statblocks: ScrollText, notes: NotebookText,
};

function Checkbox({ indeterminate = false, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" {...props} />;
}

function withKeys(excluded: ReadonlySet<string>, keys: readonly string[], include: boolean): Set<string> {
  const next = new Set(excluded);
  for (const key of keys) {
    if (include) next.delete(key);
    else next.add(key);
  }
  return next;
}

function ItemRow({ item, selection }: { item: ContentItem; selection?: ContentSelection | undefined }): React.JSX.Element {
  if (!selection) return <li className="atlas-transfer-item"><span className="atlas-transfer-item__name">{item.name}</span></li>;
  const included = selection.included.has(item.key);
  // Not left out itself, but only used by content that is.
  const orphaned = !included && !selection.excluded.has(item.key);
  return (
    <li className="atlas-transfer-item" data-orphaned={orphaned || undefined}>
      <label className="atlas-transfer-item__label">
        <Checkbox checked={included} disabled={orphaned} onChange={(event) => selection.onChange(withKeys(selection.excluded, [item.key], event.target.checked))} />
        <span className="atlas-transfer-item__name">{item.name}</span>
        {orphaned && <span className="atlas-transfer-item__hint">Only used by content you left out</span>}
      </label>
    </li>
  );
}

function GroupRow({ group, selection }: { group: ContentGroup; selection?: ContentSelection | undefined }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const Icon = ICONS[group.category];
  const keys = group.items.map((item) => item.key);
  const total = keys.length;
  const included = selection ? keys.filter((key) => selection.included.has(key)).length : total;
  const leftOut = selection ? keys.filter((key) => selection.excluded.has(key)).length : 0;
  const count = total === 0 ? 'None' : included === total ? String(total) : `${included} of ${total}`;
  return (
    <li className="atlas-transfer-group" data-empty={total === 0 || undefined}>
      <div className="atlas-transfer-group__header">
        {selection && (
          <Checkbox
            aria-label={`Include all ${group.label.toLowerCase()}`}
            checked={total > 0 && leftOut === 0}
            indeterminate={leftOut > 0 && leftOut < total}
            disabled={total === 0}
            onChange={() => selection.onChange(withKeys(selection.excluded, keys, leftOut > 0))}
          />
        )}
        <button
          type="button"
          className="atlas-transfer-group__trigger"
          aria-expanded={expanded}
          aria-controls={`${id}-items`}
          disabled={total === 0}
          onClick={() => setExpanded(!expanded)}
        >
          <Icon className="atlas-transfer-group__icon" aria-hidden="true" />
          <span className="atlas-transfer-group__label">{group.label}</span>
          <span className="atlas-transfer-group__count">{count}</span>
          <ChevronDown className="atlas-transfer-group__chevron" aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-items`} className="atlas-transfer-group__panel" data-expanded={expanded} aria-hidden={!expanded} inert={!expanded}>
        <div className="atlas-transfer-group__clip">
          <ul className="atlas-transfer-group__items">
            {group.items.map((item) => <ItemRow key={item.key} item={item} selection={selection} />)}
          </ul>
        </div>
      </div>
    </li>
  );
}

/** A collection's contents by kind, each kind expandable to list its items. */
export function ContentsList({ groups, selection }: ContentsListProps): React.JSX.Element {
  return (
    <section className="atlas-transfer-section" aria-label="What's included">
      <h4 className="atlas-transfer-section__title">What&rsquo;s included</h4>
      <ul className="atlas-transfer-groups">
        {groups.map((group) => <GroupRow key={group.category} group={group} selection={selection} />)}
      </ul>
    </section>
  );
}
