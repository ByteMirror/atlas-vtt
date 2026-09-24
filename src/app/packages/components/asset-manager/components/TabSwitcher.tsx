import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Tab } from '../types';
import { tabs, getTabDisplayName } from '../types';
import { HeaderMenu } from './HeaderMenu';

export interface TabSwitcherProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  assetCounts: Record<Tab, number>;
}

/**
 * The asset type tabs. Wide headers show them side by side; narrow ones show
 * the current type as a menu button instead (the header's container queries
 * pick one), so the toolbar stays a single row.
 */
export function TabSwitcher({ activeTab, onTabChange, assetCounts }: TabSwitcherProps): React.JSX.Element {
  const labelId = useId();
  const activeName = getTabDisplayName(activeTab);

  return (
    <>
      <nav className="atlas-asset-manager-tabs" aria-labelledby={labelId}>
        <span id={labelId} hidden>Asset type</span>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`atlas-tab-button ${activeTab === tab ? 'atlas-active' : ''}`}
            onClick={() => onTabChange(tab)}
            aria-current={activeTab === tab ? 'page' : undefined}
          >
            <span className="atlas-tab-label">{getTabDisplayName(tab)}</span>
            <span className="atlas-tab-count">{assetCounts[tab]}</span>
          </button>
        ))}
      </nav>

      <HeaderMenu
        className="atlas-am-tab-menu"
        label={`Asset type: ${activeName}`}
        triggerClassName="atlas-am-tab-menu-trigger"
        align="center"
        triggerContent={
          <>
            <span className="atlas-tab-label">{activeName}</span>
            <span className="atlas-tab-count">{assetCounts[activeTab]}</span>
            <ChevronDown className="atlas-am-tab-menu-chevron" />
          </>
        }
        items={tabs.map((tab) => ({
          key: tab,
          label: getTabDisplayName(tab),
          detail: assetCounts[tab],
          checked: tab === activeTab,
          onSelect: () => onTabChange(tab),
        }))}
      />
    </>
  );
}
