import React from 'react';
import { Eye, Plus, X } from 'lucide-react';
import { useStore } from 'zustand';
import { cn } from '../../../utils/cn';
import { useSceneTabStore } from '../hooks/useSceneTabStore';
import { playerWindowStore } from '../../stores/playerWindowStore';
import type { SceneTab } from '../../types/sceneTabTypes';
import { LabelTooltip, TooltipProvider } from '../../packages/components/primitives/tooltip';
import './scene-tab-bar.scss';

interface SceneTabBarProps {
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
  onPresentTab: (tabId: string) => void;
}

interface TabActionButtonProps {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  /** When defined the button is a toggle and stays visible while active. */
  isActive?: boolean;
  onClick: () => void;
}

/** Icon button inside a tab; keeps its events from activating or closing the tab. */
function TabActionButton({ icon: Icon, label, isActive, onClick }: TabActionButtonProps): React.ReactElement {
  return (
    <LabelTooltip side="bottom" label={label}>
      <button
        type="button"
        className={cn('atlas-scene-tab__action', isActive && 'atlas-scene-tab__action--active')}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-pressed={isActive}
      >
        <Icon size={12} />
      </button>
    </LabelTooltip>
  );
}

export function SceneTabBar({ onSwitchTab, onCloseTab, onAddTab, onPresentTab }: SceneTabBarProps): React.ReactElement | null {
  const store = useSceneTabStore();

  const tabs = useStore(store, (s) => s.tabs);
  const activeTabId = useStore(store, (s) => s.activeTabId);
  const presentedTabId = useStore(playerWindowStore, (s) => s.presentedTabId);
  const isPlayerWindowOpen = useStore(playerWindowStore, (s) => s.isOpen);

  if (tabs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="atlas-scene-tab-bar">
        {tabs.map((tab: SceneTab) => {
          const isActive = tab.id === activeTabId;
          const isPresented = isPlayerWindowOpen && tab.id === presentedTabId;
          const stateClass = isActive
            ? 'atlas-scene-tab--active'
            : tab.isLoaded
              ? 'atlas-scene-tab--loaded'
              : 'atlas-scene-tab--sleeping';

          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              className={`atlas-scene-tab ${stateClass}`}
              onClick={() => onSwitchTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSwitchTab(tab.id);
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
            >
              <LabelTooltip side="bottom" label={tab.filePath}>
                <span className="atlas-scene-tab__name">{tab.displayName}</span>
              </LabelTooltip>
              {tab.isDirty && <span className="atlas-scene-tab__dirty" />}
              <TabActionButton
                icon={Eye}
                label={isPresented ? `${tab.displayName} is shown on the player view` : `Show ${tab.displayName} on the player view`}
                isActive={isPresented}
                onClick={() => onPresentTab(tab.id)}
              />
              <TabActionButton icon={X} label={`Close ${tab.displayName}`} onClick={() => onCloseTab(tab.id)} />
            </div>
          );
        })}
        <LabelTooltip side="bottom" label="Open scene">
          <button
            className="atlas-scene-tab atlas-scene-tab-bar__add"
            onClick={onAddTab}
          >
            <Plus size={14} />
          </button>
        </LabelTooltip>
      </div>
    </TooltipProvider>
  );
}
