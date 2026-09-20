import React, { useMemo, useState, useEffect } from 'react';
import { App } from 'obsidian';
import { Application } from 'pixi.js';
import { BackgroundSprite } from './BackgroundSprite';
import { MainToolbar } from '../packages/components/MainToolbar';
import { LayerManager } from '../layerManager';
import { GridSettingsModal } from './components/GridSettingsModalSimple';
import { GridAlignmentOverlay } from './components/GridAlignmentOverlay';
import { ResponsiveWidgetBar } from './components/ResponsiveWidgetBar';
import { useViewStoreHook, useAtlasStore } from './ViewStoreContext';
import { ViewActionsMenu } from './components/ViewActionsMenu';
import { UndoRedoControls } from './components/UndoRedoControls';
import DMDashboard from './components/DMDashboard';
import { InitiativeTracker } from './components/InitiativeTracker';
import { DiceRollLog } from './components/dice-log/DiceRollLog';
import { MapLoadingOverlay } from './components/MapLoadingOverlay';
import { SceneTabBar } from './components/SceneTabBar';
import { presentTabInPlayerWindow } from '../services/PlayerWindowPresenter';
import { addTokenHighlight } from '../pixi/utils/tokenHighlight';
import { canRunMapHotkeys, matchesMapHotkey } from '../keyboard/mapHotkeys';
import { SettingsService } from '../services/SettingsService';
import { HotkeyHelp } from '../keyboard/HotkeyHelp';


// Import the new context and hook
import { AtlasUIContext, AtlasUIContextValue } from './root/AtlasUIContext';
import { useCurrentMapData } from './root/useCurrentMapData';
import { ContextMenuProvider } from './root/ContextMenuContext';

interface UIRootProps {
  app: App;
  view: any; // TODO: Add specific type for AtlasView
  pixiApp: Application | null;
  mapData: any; // Initial map data
}

/**
 * Root component for the Atlas VTT UI
 * Provides a context with core objects to all child components
 */
export const UIRoot: React.FC<UIRootProps> = ({ app, view, pixiApp, mapData }) => {
  const settings = SettingsService.forApp(app);
  const [hotkeyHelpOpen, setHotkeyHelpOpen] = useState(false);

  // Get the store directly from context
  const store = useViewStoreHook();
  
  const [, setViewport] = useState<any>(null);

  // Per-view UI visibility — driven by the store, not local state
  const isGridSettingsOpen = useAtlasStore(s => s.isGridSettingsOpen);
  const setGridSettingsOpen = useAtlasStore(s => s.setGridSettingsOpen);
  const isDMDashboardOpen = useAtlasStore(s => s.isDMDashboardOpen);
  const setDMDashboardOpen = useAtlasStore(s => s.setDMDashboardOpen);
  const isGridAlignmentOpen = useAtlasStore(s => s.isGridAlignmentOpen);
  const setGridAlignmentOpen = useAtlasStore(s => s.setGridAlignmentOpen);
  const isDiceLogOpen = useAtlasStore(s => s.isDiceLogOpen);
  const setDiceLogOpen = useAtlasStore(s => s.setDiceLogOpen);

  // Use the custom hook to manage map data state
  const currentMapData = useCurrentMapData(view, mapData);
  
  // Get viewport from renderer
  useEffect(() => {
    const updateViewport = () => {
      if (view?.renderer?.getViewportInstance) {
        const vp = view.renderer.getViewportInstance();
        setViewport(vp);
      }
    };
    
    // Initial viewport setup
    updateViewport();
    
    // Listen for viewport reinitialization (happens when switching maps)
    const handleViewportReinitialized = () => {
      updateViewport();
    };
    
    window.addEventListener('atlas-viewport-reinitialized', handleViewportReinitialized);
    
    return () => {
      window.removeEventListener('atlas-viewport-reinitialized', handleViewportReinitialized);
    };
  }, [view]);
  
  // Map navigation keyboard shortcuts (Shift+1: fit map, Shift+2: zoom to selected token)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canRunMapHotkeys(e, view?.viewId)) return;

      if (matchesMapHotkey(e, 'fitMap', settings)) {
        // Shift+1: Fit entire map in view with smooth animation
        e.preventDefault();
        const vp = view?.renderer?.getViewportInstance?.();
        const bg = view?.renderer?.getBackgroundSprite?.();
        if (!vp || !bg) return;

        const mapWidth = bg.width;
        const mapHeight = bg.height;
        const padding = 0.9;
        const scaleX = (vp.screenWidth * padding) / mapWidth;
        const scaleY = (vp.screenHeight * padding) / mapHeight;
        const targetScale = Math.max(0.1, Math.min(Math.min(scaleX, scaleY), 5));

        // Use pixi-viewport's animate method for smooth transition
        vp.animate({
          position: { x: mapWidth / 2, y: mapHeight / 2 },
          scale: targetScale,
          time: 400,
          ease: 'easeInOutCubic',
        });
      } else if (matchesMapHotkey(e, 'fitToken', settings)) {
        // Shift+2: Zoom to selected token with smooth animation
        e.preventDefault();
        const currentSelectedIds = store.getState().selectedIds || [];
        const currentTokens = store.getState().objects?.tokens || {};

        if (currentSelectedIds.length === 0) return;

        const tokenId = currentSelectedIds[0];
        const token = currentTokens[tokenId];
        if (!token || !view) return;

        const vp = view?.renderer?.getViewportInstance?.();
        if (!vp) return;

        // Animate to token position with smooth easing
        vp.animate({
          position: { x: token.x, y: token.y },
          scale: 0.9,
          time: 400,
          ease: 'easeInOutCubic',
        });

        // Add highlight effect to the token
        addTokenHighlight(view, tokenId, { highlightDuration: 2000, glowThickness: 4 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, store, settings]);

  // Context value with all required objects
  const contextValue: AtlasUIContextValue = useMemo(
    () => ({
      app,
      view,
      pixiApp,
      renderer: view?.renderer ?? null,
      mapData: currentMapData,
      layerMgr: view?.layerMgr as LayerManager | null,
    }),
    [app, view, pixiApp, currentMapData]
  );

  // Check if this is a player view - use store state which is authoritative
  const storeIsPlayerView = useAtlasStore(state => state.isPlayerView);
  const isPlayerView = storeIsPlayerView || view?.getViewType?.() === 'atlas-vtt-player';
  // Get loading state from store
  const isMapLoading = useAtlasStore(state => state.isMapLoading);
  const mapLoadingProgress = useAtlasStore(state => state.mapLoadingProgress);
  const mapLoadingMessage = useAtlasStore(state => state.mapLoadingMessage);
  
  // Debug logging for loading state
  useEffect(() => {
  }, [isMapLoading, mapLoadingMessage]);
  
  // Get background directly from store (for streamed maps)
  const storeBackground = useAtlasStore(state => state.background);

  // Get initiative state and actions for keyboard shortcuts
  const initiativeTrackerOpen = useAtlasStore(state => state.initiativeTrackerOpen);
  const initiativeIsActive = useAtlasStore(state => state.initiative?.isActive);
  const nextTurn = useAtlasStore(state => state.nextTurn);
  const previousTurn = useAtlasStore(state => state.previousTurn);

  // Handle keyboard shortcuts for DM view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canRunMapHotkeys(e, view?.viewId)) return;
      if (matchesMapHotkey(e, 'help', settings)) {
        e.preventDefault(); setHotkeyHelpOpen(true); return;
      }

      // Enter: Toggle Dice Roll Log (both DM and player views)
      if (matchesMapHotkey(e, 'diceLog', settings)) {
        e.preventDefault();
        store.getState().setDiceLogOpen(!store.getState().isDiceLogOpen);
        return;
      }

      // Tab: Toggle DM Dashboard (DM view only)
      if (!isPlayerView && matchesMapHotkey(e, 'dashboard', settings)) {
        e.preventDefault();
        store.getState().setDMDashboardOpen(!store.getState().isDMDashboardOpen);
        return;
      }

      // Arrow Up/Down: Navigate initiative order (DM view, tracker open, combat active)
      if (!isPlayerView && initiativeTrackerOpen && initiativeIsActive) {
        if (matchesMapHotkey(e, 'previousTurn', settings)) {
          e.preventDefault();
          previousTurn();
          window.dispatchEvent(new CustomEvent('atlas-initiative-hotkey', { detail: 'prev' }));
          return;
        }
        if (matchesMapHotkey(e, 'nextTurn', settings)) {
          e.preventDefault();
          nextTurn();
          window.dispatchEvent(new CustomEvent('atlas-initiative-hotkey', { detail: 'next' }));
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerView, initiativeTrackerOpen, initiativeIsActive, nextTurn, previousTurn, store, view, settings]);

  return (
    <AtlasUIContext.Provider value={contextValue}>
      <ContextMenuProvider>
        {hotkeyHelpOpen && <HotkeyHelp settings={settings} isPlayerView={isPlayerView} onClose={() => setHotkeyHelpOpen(false)} />}
        <div className="atlas-ui" style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Render BackgroundSprite - use store background (for streamed maps) or currentMapData background */} 
          {(storeBackground || currentMapData?.background) && (
            <BackgroundSprite imagePath={storeBackground || currentMapData.background} />
          )}

          {/* Navigation controls - only for DM view when not loading */}

          
          {/* View actions menu - only for DM view when not loading */}
          {!isPlayerView && !isMapLoading && <ViewActionsMenu app={app} filePath={view?.file?.path} />}

          {/* Scene Tab Bar - only for DM view when not loading */}
          {!isPlayerView && !isMapLoading && (
            <SceneTabBar
              onSwitchTab={(tabId) => view?.switchToTab(tabId)}
              onCloseTab={(tabId) => view?.closeTab(tabId)}
              onAddTab={() => view?.openSceneBrowser()}
              onPresentTab={(tabId) => {
                if (view) void presentTabInPlayerWindow(app, view, tabId);
              }}
            />
          )}

          {/* Bottom toolbar row — undo/redo docked left of main toolbar */}
          {!isMapLoading && (
            <div className="atlas-bottom-toolbar-row">
              {!isPlayerView && <UndoRedoControls viewId={view?.viewId} />}
              <MainToolbar viewId={view?.viewId} />
            </div>
          )}
          
          
          {/* Widget Bar - visible to both DM and players when not loading */}
          {!isMapLoading && (
            <ResponsiveWidgetBar 
              isPlayerView={isPlayerView}
              store={store}
              viewId={view?.viewId}
            />
          )}
          
          {/* Grid Settings Modal - only render when needed */}
          {isGridSettingsOpen && (
            <GridSettingsModal
              isOpen={isGridSettingsOpen}
              onClose={() => setGridSettingsOpen(false)}
              view={view}
            />
          )}


          {/* Grid Alignment Overlay - only render when needed */}
          {isGridAlignmentOpen && (
            <GridAlignmentOverlay
              onClose={() => setGridAlignmentOpen(false)}
            />
          )}

          {/* DM Dashboard - only for DM view */}
          {!isPlayerView && (
            <DMDashboard
              isOpen={isDMDashboardOpen}
              onClose={() => {
                // Give CodeMirror time to clean up before closing
                window.setTimeout(() => setDMDashboardOpen(false), 0);
              }}
            />
          )}

          {/* Dice Roll Log - left side panel */}
          {!isMapLoading && (
            <DiceRollLog
              isOpen={isDiceLogOpen}
              onClose={() => setDiceLogOpen(false)}
            />
          )}

          {/* Initiative Tracker - only for DM view */}
          {!isPlayerView && !isMapLoading && <InitiativeTracker />}

          {/* Player Character Sheet - REMOVED: Players should only edit via their character sheet file */}
          
          {/* Loading overlay - renders last to be on top of everything */}
          <MapLoadingOverlay 
            isLoading={isMapLoading}
            {...(mapLoadingProgress !== undefined ? { progress: mapLoadingProgress } : {})}
            {...(mapLoadingMessage !== undefined ? { message: mapLoadingMessage } : {})}
          />

        </div>
      </ContextMenuProvider>
    </AtlasUIContext.Provider>
  );
};
