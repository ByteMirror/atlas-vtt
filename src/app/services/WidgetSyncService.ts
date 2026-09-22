import { Plugin } from 'obsidian';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';

/** Payload carried by each kind of widget animation. */
export interface WidgetAnimationPayloads {
  pulse: { intensity?: number | undefined };
  active: { isActive?: boolean | undefined; duration?: number | undefined };
  'key-held': { keyNumber: number; held: boolean };
}

export type WidgetAnimationType = keyof WidgetAnimationPayloads;

/** Discriminated by `animationType`, so receivers get the matching `data` shape. */
export type WidgetAnimationState = {
  [T in WidgetAnimationType]: {
    sourceViewId: string;
    animationType: T;
    widgetId: string;
    data?: WidgetAnimationPayloads[T] | undefined;
    timestamp: number;
  };
}[WidgetAnimationType];

/** The slice of view state that is mirrored between views. */
type SyncedWidgetState = Pick<ViewAtlasState, 'widgetValues'> & {
  widgets: ViewAtlasState['widgetSettings']['widgets'];
};

interface WidgetSyncEventDetail extends SyncedWidgetState {
  sourceViewId: string;
}

const WIDGET_SYNC_EVENT = 'atlas-widget-sync';

/**
 * Service to synchronize widget values between all atlas views
 * Uses custom events to broadcast changes across views
 */
export class WidgetSyncService {
  private plugin: Plugin;
  private stores: Map<string, ViewAtlasStore> = new Map();
  private unsubscribers: Map<string, () => void> = new Map();
  private isUpdating = false;
  private animationListeners: Map<string, Set<(state: WidgetAnimationState) => void>> = new Map();
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.setupEventListeners();
  }
  
  /**
   * Register a store to receive widget sync updates
   */
  registerStore(viewId: string, store: ViewAtlasStore): void {
    this.unsubscribers.get(viewId)?.();
    this.stores.set(viewId, store);

    // Subscribe to widget value changes in this store
    const unsubscribe = store.subscribe(
      (state): SyncedWidgetState => ({
        // Only sync widget definitions, not view-specific settings like globalVisible
        widgets: state.widgetSettings?.widgets || {},
        widgetValues: state.widgetValues
      }),
      (curr) => {
        // Only broadcast if not currently applying an update
        if (!this.isUpdating) {
          this.broadcastWidgetUpdate(viewId, curr);
        }
      },
      {
        equalityFn: (a, b) =>
          JSON.stringify(a.widgets) === JSON.stringify(b.widgets) &&
          JSON.stringify(a.widgetValues) === JSON.stringify(b.widgetValues)
      }
    );

    this.unsubscribers.set(viewId, unsubscribe);
  }
  
  /**
   * Unregister a store from widget sync
   */
  unregisterStore(viewId: string): void {
    this.unsubscribers.get(viewId)?.();
    this.unsubscribers.delete(viewId);
    this.stores.delete(viewId);
    
    // Clean up animation listeners
    this.animationListeners.delete(viewId);
  }
  
  /**
   * Broadcast widget updates to all other views
   */
  private broadcastWidgetUpdate(sourceViewId: string, widgetData: SyncedWidgetState): void {
    // Create custom event
    const event = new CustomEvent<WidgetSyncEventDetail>(WIDGET_SYNC_EVENT, {
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
  public broadcastWidgetAnimation<T extends WidgetAnimationType>(
    sourceViewId: string,
    animationType: T,
    widgetId: string,
    data?: WidgetAnimationPayloads[T],
  ): void {
    // The signature ties `data` to `animationType`; TypeScript cannot carry that
    // correlation from a generic into the union, hence the assertion.
    const animationState = {
      sourceViewId,
      animationType,
      widgetId,
      data,
      timestamp: Date.now()
    } as WidgetAnimationState;
    
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
  public subscribeToAnimations(viewId: string, callback: (state: WidgetAnimationState) => void): () => void {
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
  private setupEventListeners(): void {
    // Listen for widget sync events
    const handleWidgetSync = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const { sourceViewId, widgets, widgetValues } = event.detail as WidgetSyncEventDetail;
      
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
    
    window.addEventListener(WIDGET_SYNC_EVENT, handleWidgetSync);

    // Clean up on plugin unload
    this.plugin.register(() => {
      window.removeEventListener(WIDGET_SYNC_EVENT, handleWidgetSync);
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
  destroy(): void {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();

    // Clear all listeners and states
    this.animationListeners.clear();
    this.stores.clear();
  }
}
