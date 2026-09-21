import { App } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import AssetManager from '../packages/components/asset-manager/AssetManager';
import { AtlasUIContext } from '../react/root/AtlasUIContext';
import type { Tab } from '../packages/components/asset-manager/types';

export class GlobalAssetManagerService {
  private app: App;
  private root: Root | null = null;
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = false;
  private initialTab: Tab | undefined;

  constructor(app: App) {
    this.app = app;
  }

  open(tab?: 'scenes' | 'maps' | 'campaigns' | 'characters' | 'tokens' | 'encounters'): void {
    if (this.isOpen) {
      // If already open, just update the tab
      this.close();
    }

    const mappedTab: Tab | undefined =
      tab === 'campaigns' ? 'encounters' :
      tab === 'characters' ? 'tokens' :
      tab;
    this.initialTab = mappedTab;
    this.isOpen = true;

    // Create container
    this.container = document.body.createDiv();
    this.container.addClasses(['atlas-vtt-plugin', 'atlas-global-asset-manager-container']);

    // Create React root and render with context
    this.root = createRoot(this.container);
    
    // Create a minimal context value
    const contextValue = {
      app: this.app,
      view: null,
      pixiApp: null,
      renderer: null,
      isPlayerMode: false,
      setPlayerMode: () => {}
    };
    
    // No ViewStoreProvider: there is no map view here, the asset manager reads the store optionally.
    this.root.render(
      React.createElement(AtlasUIContext.Provider, {
        value: contextValue,
        children: React.createElement(AssetManager, {
          isOpen: true,
          onClose: () => this.close(),
          ...(this.initialTab ? { initialTab: this.initialTab } : {})
        })
      })
    );
  }

  close(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.isOpen = false;
    this.initialTab = undefined;
  }

  isModalOpen(): boolean {
    return this.isOpen;
  }
}
