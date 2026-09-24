import { App, Plugin } from 'obsidian';
import type { ViewAtlasState, ViewAtlasStore } from '../storeFactory';
import {
  pickCollectionWidgets,
  sameWidgets,
  withCollectionWidgets,
  type SceneWidgets,
  type WidgetRecord,
} from '../utils/collectionWidgets';
import { runUntracked } from '../stores/history';
import { AssetService } from './AssetService';
import { CollectionWidgetStore } from './CollectionWidgetStore';

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

/** Shared fallback, so a store without widget settings never looks changed. */
const NO_WIDGETS: WidgetRecord = {};

/** The slice of view state that is mirrored between views. */
function sceneWidgets(state: ViewAtlasState): SceneWidgets {
  return { widgets: state.widgetSettings?.widgets ?? NO_WIDGETS, widgetValues: state.widgetValues };
}

/**
 * Keeps widgets consistent between all Atlas views. Views showing the same scene
 * mirror all its widgets; views of other scenes in the same collection mirror the
 * collection-wide ones, which are also written to the collection settings.
 */
export class WidgetSyncService {
  private static readonly instances = new WeakMap<App, WidgetSyncService>();

  /** The plugin's sync service, once a map view has created it. */
  static forApp(app: App): WidgetSyncService | undefined {
    return this.instances.get(app);
  }

  private plugin: Plugin;
  private collectionWidgets: CollectionWidgetStore;
  private stores: Map<string, ViewAtlasStore> = new Map();
  private unsubscribers: Map<string, () => void> = new Map();
  private isUpdating = false;
  private animationListeners: Map<string, Set<(state: WidgetAnimationState) => void>> = new Map();
  
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.collectionWidgets = new CollectionWidgetStore(AssetService.getInstance(plugin.app));
    WidgetSyncService.instances.set(plugin.app, this);
  }

  /**
   * Changes a collection's shared widgets from outside its maps, e.g. when its
   * game system adds a timer, and shows the result in its open scenes at once.
   */
  editCollectionWidgets(collectionId: string, edit: (widgets: WidgetRecord) => WidgetRecord): void {
    const widgets = edit(this.collectionWidgets.get(collectionId));
    this.collectionWidgets.set(collectionId, widgets);
    this.stores.forEach((store) => {
      const { isMapLoading, mapPath } = store.getState();
      if (isMapLoading || !mapPath || this.collectionWidgets.collectionFor(mapPath) !== collectionId) return;
      this.replaceCollectionWidgets(store, widgets);
    });
  }
  
  /**
   * Register a store to receive widget sync updates
   */
  registerStore(viewId: string, store: ViewAtlasStore): void {
    this.unsubscribers.get(viewId)?.();
    this.stores.set(viewId, store);

    const unsubscribeWidgets = store.subscribe(
      // Only widget definitions and values sync, not view-specific settings like globalVisible
      sceneWidgets,
      (curr) => {
        if (this.isUpdating) return;
        const { isMapLoading, mapPath } = store.getState();
        // Loading a map clears and restores its widgets; the collection's stay on screen
        // throughout, and only edits reach other views.
        if (isMapLoading) this.showCollectionWidgets(store);
        else this.propagateWidgets(viewId, mapPath, curr);
      },
      {
        // Immer keeps unchanged branches, so references tell whether widgets changed.
        // This runs on every store update, including each drag frame.
        equalityFn: (a, b) => a.widgets === b.widgets && a.widgetValues === b.widgetValues
      }
    );
    const unsubscribeLoading = store.subscribe(
      (state) => state.isMapLoading,
      (loading) => {
        if (!loading) this.applyCollectionWidgets(store);
      }
    );

    this.unsubscribers.set(viewId, () => {
      unsubscribeWidgets();
      unsubscribeLoading();
    });
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

  /** Adds the collection-wide widgets to a store whose scene has just loaded. */
  private applyCollectionWidgets(store: ViewAtlasStore): void {
    // The asset index loads once; waiting keeps a scene opened at startup from missing its widgets.
    void AssetService.getInstance(this.plugin.app).initialize().then(() => this.showCollectionWidgets(store));
  }

  /** Shows the widgets of the store's collection next to its scene's own. */
  private showCollectionWidgets(store: ViewAtlasStore): void {
    const { mapPath } = store.getState();
    const collectionId = mapPath ? this.collectionWidgets.collectionFor(mapPath) : null;
    if (collectionId) this.replaceCollectionWidgets(store, this.collectionWidgets.get(collectionId));
  }

  /** Mirrors an edit in one view to the collection settings and every related view. */
  private propagateWidgets(sourceViewId: string, mapPath: string | null, scene: SceneWidgets): void {
    if (!mapPath) return;
    const collectionId = this.collectionWidgets.collectionFor(mapPath);
    const shared = pickCollectionWidgets(scene);
    if (collectionId) this.collectionWidgets.set(collectionId, shared);

    this.isUpdating = true;
    try {
      this.stores.forEach((store, viewId) => {
        const state = store.getState();
        if (viewId === sourceViewId || state.isMapLoading || !state.mapPath) return;
        if (state.mapPath === mapPath) {
          // Same scene: mirror every widget, keeping view-specific globalVisible, position and scale
          runUntracked(store, () => store.setState({
            widgetSettings: { ...state.widgetSettings, widgets: scene.widgets },
            widgetValues: scene.widgetValues
          }));
        } else if (collectionId && this.collectionWidgets.collectionFor(state.mapPath) === collectionId) {
          this.replaceCollectionWidgets(store, shared);
        }
      });
    } finally {
      this.isUpdating = false;
    }
  }

  /** Syncs and loads are not edits of this view, so they never become undo steps. */
  private replaceCollectionWidgets(store: ViewAtlasStore, shared: WidgetRecord): void {
    const state = store.getState();
    const current = sceneWidgets(state);
    if (sameWidgets(pickCollectionWidgets(current), shared)) return;
    const { widgets, widgetValues } = withCollectionWidgets(current, shared);
    const wasUpdating = this.isUpdating;
    this.isUpdating = true;
    try {
      runUntracked(store, () => store.setState({ widgetSettings: { ...state.widgetSettings, widgets }, widgetValues }));
    } finally {
      this.isUpdating = wasUpdating;
    }
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
   * Get all registered view IDs
   */
  getRegisteredViews(): string[] {
    return Array.from(this.stores.keys());
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    WidgetSyncService.instances.delete(this.plugin.app);
    this.collectionWidgets.flush();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.unsubscribers.clear();

    // Clear all listeners and states
    this.animationListeners.clear();
    this.stores.clear();
  }
}
