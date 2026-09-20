import { Plugin } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';

/**
 * Service to synchronize widget values between all atlas views
 * Uses custom events to broadcast changes across views
 */
interface AnimationState {
  sourceViewId: string;
  animationType: 'pulse' | 'active' | 'key-held';
  widgetId: string;
  data?: any;
  timestamp: number;
}

export class WidgetSyncService {
  private plugin: Plugin;
  private stores: Map<string, any> = new Map();
  private isUpdating = false;
  private animationListeners: Map<string, Set<(state: AnimationState) => void>> = new Map();
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.setupEventListeners();
  }
  
  /**
   * Register a store to receive widget sync updates
   */
  registerStore(viewId: string, store: any) {
    this.stores.set(viewId, store);
    
    // Subscribe to widget value changes in this store
    const unsubscribe = store.subscribe(
      (state: ViewAtlasState) => ({
        // Only sync widget definitions, not view-specific settings like globalVisible
        widgets: state.widgetSettings?.widgets || {},
        widgetValues: state.widgetValues
      }),
      (curr: any, prev: any) => {
        // Only broadcast if not currently applying an update
        if (!this.isUpdating) {
          this.broadcastWidgetUpdate(viewId, curr);
        }
      },
      {
        equalityFn: (a: any, b: any) => 
          JSON.stringify(a.widgets) === JSON.stringify(b.widgets) &&
          JSON.stringify(a.widgetValues) === JSON.stringify(b.widgetValues)
      }
    );
    
    // Store the unsubscribe function
    store._widgetSyncUnsubscribe = unsubscribe;
  }
  
  /**
   * Unregister a store from widget sync
   */
  unregisterStore(viewId: string) {
    const store = this.stores.get(viewId);
    if (store && store._widgetSyncUnsubscribe) {
      store._widgetSyncUnsubscribe();
      delete store._widgetSyncUnsubscribe;
    }
    this.stores.delete(viewId);
    
    // Clean up animation listeners
    this.animationListeners.delete(viewId);
  }
  
  /**
   * Broadcast widget updates to all other views
   */
  private broadcastWidgetUpdate(sourceViewId: string, widgetData: any) {
    // Create custom event
    const event = new CustomEvent('atlas-widget-sync', {
      detail: {
        sourceViewId,
        widgets: widgetData.widgets,
        widgetValues: widgetData.widgetValues
      }
    });
    
    // Dispatch to window
    window.dispatchEvent(event);
  }
  
  /**
   * Broadcast widget animation events to all views
   */
  public broadcastWidgetAnimation(sourceViewId: string, animationType: 'pulse' | 'active' | 'key-held', widgetId: string, data?: any) {
    // Create animation state
    const animationState: AnimationState = {
      sourceViewId,
      animationType,
      widgetId,
      data,
      timestamp: Date.now()
    };
    
    // Directly notify all registered listeners in ALL views (including other windows)
    // This is the key - we iterate through all stores just like widget value sync does
    this.animationListeners.forEach((listeners, viewId) => {
      if (viewId !== sourceViewId) {
        listeners.forEach(listener => {
          try {
            listener(animationState);
          } catch (e) {
            console.error(`[WidgetSync] Error triggering animation in view ${viewId}:`, e);
          }
        });
      }
    });
  }
  
  /**
   * Subscribe to animation events for a specific view
   */
  public subscribeToAnimations(viewId: string, callback: (state: AnimationState) => void): () => void {
    if (!this.animationListeners.has(viewId)) {
      this.animationListeners.set(viewId, new Set());
    }
    
    const listeners = this.animationListeners.get(viewId)!;
    listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) {
        this.animationListeners.delete(viewId);
      }
    };
  }
  
  /**
   * Set up event listeners for widget sync
   */
  private setupEventListeners() {
    // Listen for widget sync events
    const handleWidgetSync = (event: CustomEvent) => {
      const { sourceViewId, widgets, widgetValues } = event.detail;
      
      // Apply update to all stores except the source
      this.isUpdating = true;
      try {
        this.stores.forEach((store, viewId) => {
          if (viewId !== sourceViewId) {
            const currentState = store.getState();
            
            // Update only the widget definitions, preserve view-specific settings
            store.setState({
              widgetSettings: {
                ...currentState.widgetSettings,
                widgets: widgets  // Only update widget definitions
                // globalVisible, position, scale remain view-specific
              },
              widgetValues
            });
          }
        });
      } finally {
        this.isUpdating = false;
      }
    };
    
    window.addEventListener('atlas-widget-sync', handleWidgetSync as EventListener);
    
    // Clean up on plugin unload
    this.plugin.register(() => {
      window.removeEventListener('atlas-widget-sync', handleWidgetSync as EventListener);
    });
  }
  
  /**
   * Get all registered view IDs
   */
  getRegisteredViews(): string[] {
    return Array.from(this.stores.keys());
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.stores.forEach((store) => {
      if (store && store._widgetSyncUnsubscribe) {
        store._widgetSyncUnsubscribe();
        delete store._widgetSyncUnsubscribe;
      }
    });

    // Clear all listeners and states
    this.animationListeners.clear();
    this.stores.clear();
  }
}
