import { App } from 'obsidian';
import { mountUI, unmountUI } from '../react/index';
import { EventEmitter } from 'events';
import type { ViewAtlasState } from '../storeFactory';
import type { StoreApi } from 'zustand';
import type { AtlasView } from '../atlas-view';

export class UIOverlay {
  private uiContainer: HTMLDivElement | null = null;
  private eventBus: EventEmitter;
  private view: AtlasView | null = null;
  private mountObserver: MutationObserver | null = null;
  private remountTimeout: number | null = null;

  constructor(private app: App, eventBus: EventEmitter, private store: StoreApi<ViewAtlasState>) {
    this.eventBus = eventBus;
  }

  /**
   * Mount the React UI overlay
   * @param containerEl The parent container element
   * @param view The AtlasView instance
   * @param pixiApp The PixiJS application instance
   */
  public mount(containerEl: HTMLElement, view: AtlasView, pixiApp: any): void {
    if (this.uiContainer) {
      this.unmount();
    }

    this.view = view;
    this.uiContainer = containerEl.createDiv({ cls: 'atlas-vtt-plugin atlas-react-ui-container' });
    
    // Add view ID as data attribute for keyboard shortcut targeting
    if (view?.viewId) {
      this.uiContainer.setAttribute('data-view-id', view.viewId);
    }
    
    // Make sure the React overlay sits above the Pixi canvas
    Object.assign(this.uiContainer.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1000',
      pointerEvents: 'none'   // always on top
    });
    
    // Add debug logging for container visibility
    // Monitor for removal
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach(node => {
            if (node === this.uiContainer) {
              console.error('[UIOverlay] UI Container was removed from DOM!');
            }
          });
        }
      });
    });
    
    if (this.uiContainer.parentElement) {
      observer.observe(this.uiContainer.parentElement, { childList: true });
    }
    this.mountObserver = observer;
    
    // Pass the obtained PixiApp instance, renderer, and store to mountUI
    mountUI(this.app, this.uiContainer, null, view, pixiApp, this.store);
    
    this.eventBus.emit('ui-mounted', this.uiContainer);
  }

  /**
   * Unmount the React UI overlay
   */
  public unmount(): void {
    if (this.remountTimeout) {
      window.clearTimeout(this.remountTimeout);
      this.remountTimeout = null;
    }

    if (this.mountObserver) {
      this.mountObserver.disconnect();
      this.mountObserver = null;
    }

    // Unmount React UI overlay (destroys PixiViewport and its children)
    if (this.uiContainer) {
      unmountUI(this.uiContainer);
      this.uiContainer.remove();
      this.uiContainer = null;
      this.eventBus.emit('ui-unmounted');
    }
  }

  /**
   * Get the UI container element
   * @returns The UI container element or null if not mounted
   */
  public getContainer(): HTMLDivElement | null {
    return this.uiContainer;
  }

  /**
   * Check if the UI is mounted
   * @returns True if the UI is mounted
   */
  public isMounted(): boolean {
    return this.uiContainer !== null;
  }

  /**
   * Update data for the UI
   * @param type The event type
   * @param data The data to update
   */
  public updateUI(type: string, data: any): void {
    window.dispatchEvent(
      new CustomEvent(`atlas-${type}`, {
        detail: data,
      })
    );
  }


  
  /**
   * Force remount the React UI overlay
   * Used when switching maps to ensure clean state
   */
  public remount(): void {
    if (!this.uiContainer) {
      console.warn("[UIOverlay] Cannot remount - UI not mounted");
      return;
    }
    
    // Store references we need
    const containerEl = this.uiContainer.parentElement;
    const currentView = this.view;
    
    // Get the PixiApp from the view's renderer
    const pixiApp = currentView?.renderer?.getAppInstance?.() || null;
    
    // Unmount current UI
    this.unmount();
    
    // Small delay to ensure cleanup
    this.remountTimeout = window.setTimeout(() => {
      this.remountTimeout = null;
      if (containerEl && currentView) {
        this.mount(containerEl, currentView, pixiApp);
      }
    }, 50);
  }
} 
