import React from 'react';
import { FolderOpen, Map as MapIcon } from 'lucide-react';
import { TokenIcon } from '../../../../react/components/TokenIcon';
import type { TagGroup } from '../../../../services/tagGroups';

export type TagManagerTab = TagGroup | 'collections';

const TABS: readonly { id: TagManagerTab; label: string; icon: React.ReactElement }[] = [
  { id: 'maps', label: 'Map Tags', icon: <MapIcon /> },
  { id: 'tokens', label: 'Character Tags', icon: <TokenIcon /> },
  { id: 'collections', label: 'Collections', icon: <FolderOpen /> },
];

interface TagManagerTabsProps {
  activeTab: TagManagerTab;
  onSelect: (tab: TagManagerTab) => void;
}

/** Map tags, character tags and collections: the lists Manage Tags & Collections edits. */
export function TagManagerTabs({ activeTab, onSelect }: TagManagerTabsProps): React.JSX.Element {
  return (
    <div className="atlas-tag-manager-tabs">
      <div className="atlas-tab-switcher" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`atlas-tab-button ${activeTab === tab.id ? 'atlas-active' : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
