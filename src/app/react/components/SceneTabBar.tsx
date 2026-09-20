import React from 'react';
import { Eye, Plus, X } from 'lucide-react';
import { useStore } from 'zustand';
import { cn } from '../../../utils/cn';
import { useAtlasUI } from '../root/AtlasUIContext';
import { createTabMetaStore } from '../../stores/tabMetaStore';
import { playerWindowStore } from '../../stores/playerWindowStore';
import type { SceneTab } from '../../types/sceneTabTypes';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../packages/components/primitives/tooltip';
import './scene-tab-bar.scss';

/** Static empty store used as safe fallback when view.tabMetaStore is unavailable. */
const EMPTY_TAB_STORE = createTabMetaStore();

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

/** Wraps `children` in the shared Atlas tooltip showing `label`. */
function LabelTooltip({ label, children }: { label: string; children: React.ReactElement }): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={10}>
        <div className="tooltip-inner">
          <span className="tooltip-label">{label}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Icon button inside a tab; keeps its events from activating or closing the tab. */
function TabActionButton({ icon: Icon, label, isActive, onClick }: TabActionButtonProps): React.ReactElement {
  return (
    <LabelTooltip label={label}>
      <button
        type="button"
        className={cn('atlas-scene-tab__action', isActive && 'atlas-scene-tab__action--active')}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={label}
        aria-pressed={isActive}
      >
        <Icon size={12} />
      </button>
    </LabelTooltip>
  );
}

export function SceneTabBar({ onSwitchTab, onCloseTab, onAddTab, onPresentTab }: SceneTabBarProps): React.ReactElement | null {
  const { view } = useAtlasUI();
  const store = view?.tabMetaStore ?? EMPTY_TAB_STORE;

  const tabs = useStore(store, (s) => (s as any).tabs as SceneTab[]);
  const activeTabId = useStore(store, (s) => (s as any).activeTabId as string | null);
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
              <LabelTooltip label={tab.filePath}>
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
        <LabelTooltip label="Open scene">
          <button
            className="atlas-scene-tab atlas-scene-tab-bar__add"
            onClick={onAddTab}
            aria-label="Open scene"
          >
            <Plus size={14} />
          </button>
        </LabelTooltip>
      </div>
    </TooltipProvider>
  );
}
