import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { lootBaseItemCount, type LootBase } from '../../../loot/LootBaseReader';
import { t } from '../../../i18n';

type CheckState = 'on' | 'off' | 'mixed';

interface CheckProps {
  state: CheckState;
  label: string;
  count: number;
  onToggle: () => void;
}

/** A checkbox row; the label and count toggle it too. */
function CheckRow({ state, label, count, onToggle }: CheckProps): React.ReactElement {
  return (
    <label className={`atlas-loot-tree__check${state === 'off' ? '' : ' is-on'}`}>
      <input
        type="checkbox"
        checked={state === 'on'}
        ref={(input) => { if (input) input.indeterminate = state === 'mixed'; }}
        onChange={onToggle}
      />
      <span className="atlas-loot-tree__label">{label}</span>
      <span className="atlas-loot-tree__count">{count}</span>
    </label>
  );
}

function stateOf(ids: readonly string[], disabled: ReadonlySet<string>): CheckState {
  const on = ids.filter((id) => !disabled.has(id)).length;
  return on === ids.length ? 'on' : on === 0 ? 'off' : 'mixed';
}

interface LootSourceTreeProps {
  bases: LootBase[];
  disabled: ReadonlySet<string>;
  onChange: (disabled: string[]) => void;
}

/**
 * The collection's loot bases as a checklist: switch a whole base on or off,
 * or open it to pick its views. Only checked views are rolled on.
 */
export function LootSourceTree({ bases, disabled, onChange }: LootSourceTreeProps): React.ReactElement {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const withViews = bases.filter((base) => base.views.length > 0);
  const allIds = withViews.flatMap((base) => base.views.map((view) => view.id));

  const setViews = (ids: readonly string[], enabled: boolean): void => {
    const next = new Set(disabled);
    for (const id of ids) {
      if (enabled) next.delete(id);
      else next.add(id);
    }
    onChange([...next]);
  };
  const toggleExpanded = (path: string): void => {
    const next = new Set(expanded);
    if (!next.delete(path)) next.add(path);
    setExpanded(next);
  };
  const allState = stateOf(allIds, disabled);

  return (
    <div className="atlas-loot-tree">
      <div className="atlas-loot-tree__head">
        <span className="atlas-loot-section-label">{t('loot.tree.rollFrom')}</span>
        <LabelTooltip describe label={allState === 'on' ? t('loot.tree.untickAll') : t('loot.tree.tickAll')}>
          <button type="button" className="atlas-loot-text-button" onClick={() => setViews(allIds, allState !== 'on')}>
            {allState === 'on' ? t('loot.tree.none') : t('loot.tree.all')}
          </button>
        </LabelTooltip>
      </div>
      <ul className="atlas-loot-tree__bases">
        {withViews.map((base) => {
          const ids = base.views.map((view) => view.id);
          const isOpen = expanded.has(base.path);
          return (
            <li key={base.path} className={`atlas-loot-tree__base${isOpen ? ' is-open' : ''}`}>
              <div className="atlas-loot-tree__row">
                <LabelTooltip label={t(isOpen ? 'loot.tree.hideViews' : 'loot.tree.showViews', { name: base.name })}>
                  <button
                    type="button"
                    className="atlas-loot-tree__toggle"
                    aria-expanded={isOpen}
                    onClick={() => toggleExpanded(base.path)}
                  >
                    <ChevronRight />
                  </button>
                </LabelTooltip>
                <CheckRow
                  state={stateOf(ids, disabled)}
                  label={base.name}
                  count={lootBaseItemCount(base)}
                  onToggle={() => setViews(ids, stateOf(ids, disabled) !== 'on')}
                />
              </div>
              {isOpen && (
                <ul className="atlas-loot-tree__views">
                  {base.views.map((view) => (
                    <li key={view.id} className="atlas-loot-tree__row">
                      <CheckRow
                        state={disabled.has(view.id) ? 'off' : 'on'}
                        label={view.name}
                        count={view.items.length}
                        onToggle={() => setViews([view.id], disabled.has(view.id))}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
