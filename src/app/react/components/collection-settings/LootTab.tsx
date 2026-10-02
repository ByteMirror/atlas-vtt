/**
 * LootTab — the bases whose views the loot roller rolls on, and the currency
 * their prices are in.
 */

import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Table, Trash2 } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { isLootBaseLoaded, lootBaseItemCount, needsBases, type LootBase } from '../../../loot/LootBaseReader';
import { parentPath } from '../../../utils/pathUtils';
import { useLootBases } from '../loot/useLootBases';
import LinkedNotePicker from '../LinkedNotePicker';
import { Tutorial } from '../../../onboarding/Tutorial';
import { LOOT_SETTINGS_STEPS, LOOT_TUTORIAL_LABEL } from '../../../onboarding/lootTutorials';
import { t } from '../../../i18n';

interface LootTabProps {
  app: App;
  lootBases: string[];
  onBasesChange: (lootBases: string[]) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
}

function baseSummary(base: LootBase | undefined): string {
  if (!base || !isLootBaseLoaded(base)) return t('csm.loot.reading');
  if (base.missing) return t('csm.loot.notFound');
  if (base.views.length === 0) return t('csm.loot.noViews');
  if (needsBases(base)) return t('csm.loot.basesOff');
  return `${t('csm.loot.views', { count: base.views.length })} · ${t('loot.items', { count: lootBaseItemCount(base) })}`;
}

export function LootTab({ app, lootBases, onBasesChange, currency, onCurrencyChange }: LootTabProps): React.ReactElement {
  const { bases } = useLootBases(app, lootBases);
  const [picking, setPicking] = useState(false);
  const baseFiles = useMemo(() => app.vault.getFiles().filter((file) => file.extension === 'base'), [app]);

  const addBase = (path: string): void => {
    if (!lootBases.includes(path)) onBasesChange([...lootBases, path]);
    setPicking(false);
  };

  return (
    <>
      <p className="atlas-csm-hint">
        {t('csm.loot.intro')}
      </p>

      <Tutorial
        id="lootSettings"
        label={LOOT_TUTORIAL_LABEL}
        steps={LOOT_SETTINGS_STEPS}
        action={lootBases.length === 0 ? { label: t('csm.loot.addBase'), onClick: () => setPicking(true) } : undefined}
      />

      <div className="atlas-csm-loot-bases">
        {lootBases.length > 0 ? (
          <div className="atlas-csm-loot-list">
            {lootBases.map((path) => {
              const base = bases.find((entry) => entry.path === path);
              const problem = base !== undefined && (base.missing || base.views.length === 0 || needsBases(base));
              return (
                <div key={path} className={`atlas-csm-loot-base${problem ? ' atlas-csm-loot-base--problem' : ''}`}>
                  <span className="atlas-csm-loot-base-icon">{problem ? <AlertTriangle /> : <Table />}</span>
                  <span className="atlas-csm-loot-base-text">
                    <span className="atlas-csm-loot-base-name">{base?.name ?? path}</span>
                    <span className="atlas-csm-loot-base-path">{parentPath(path) || t('csm.loot.vaultRoot')}</span>
                  </span>
                  <span className="atlas-csm-loot-base-summary">
                    {baseSummary(base)}
                  </span>
                  <LabelTooltip label={t('csm.loot.removeBase')}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="atlas-csm-condition-delete"
                      aria-label={t('csm.loot.removeBase')}
                      onClick={() => onBasesChange(lootBases.filter((entry) => entry !== path))}
                    >
                      <Trash2 />
                    </Button>
                  </LabelTooltip>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="atlas-csm-empty">{t('csm.loot.noBases')}</div>
        )}

        {picking ? (
          <div className="atlas-csm-loot-picker">
            <LinkedNotePicker app={app} files={baseFiles} noun="bases" icon={Table} onSelect={addBase} />
            <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setPicking(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setPicking(true)}>
            <Plus />
            {t('csm.loot.addLootBase')}
          </Button>
        )}
      </div>

      <div className="atlas-csm-field atlas-csm-loot-currency">
        <label className="atlas-csm-label" htmlFor="atlas-csm-loot-currency">{t('csm.loot.currency')}</label>
        <input
          id="atlas-csm-loot-currency"
          type="text"
          className="atlas-csm-input"
          placeholder={t('csm.loot.currencyPlaceholder')}
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
        />
        <p className="atlas-csm-hint">{t('csm.loot.currencyHint')}</p>
      </div>
    </>
  );
}
