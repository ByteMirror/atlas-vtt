import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { SettingsService } from './SettingsService';

/**
 * A player window overlay drawn from the presented scene's view store.
 *
 * All scene tabs of a view share one store, so while the DM browses another tab
 * it holds a different map. `hold` therefore keeps the presented scene's last
 * state until `present` binds the overlay to a scene again.
 */
export abstract class PlayerSceneOverlay {
  private state: ViewAtlasState | undefined;
  private unsubscribeStore: (() => void) | undefined;
  private readonly unsubscribeSettings: () => void;

  protected constructor(protected readonly container: HTMLElement, protected readonly settings: SettingsService) {
    this.unsubscribeSettings = settings.onChange(() => this.refresh());
  }

  /** Bind to the presented view, including when it belongs to a different Atlas leaf. */
  present(store: StoreApi<ViewAtlasState>): void {
    this.unsubscribeStore?.();
    this.state = store.getState();
    this.refresh();
    this.unsubscribeStore = store.subscribe((state, previous) => {
      this.state = state;
      if (this.hasChanged(state, previous)) this.refresh();
    });
  }

  /**
   * Freeze the presented scene while the DM browses other scene tabs. Views switch
   * the active tab before loading the next map, so the kept state is still the presented one.
   */
  hold(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
  }

  destroy(): void {
    this.hold();
    this.unsubscribeSettings();
  }

  /** Whether a store update touches the state this overlay shows. */
  protected abstract hasChanged(state: ViewAtlasState, previous: ViewAtlasState): boolean;

  /** Fills the emptied container from the presented scene's `state`. */
  protected abstract render(state: ViewAtlasState): void;

  private refresh(): void {
    this.container.empty();
    if (this.state) this.render(this.state);
  }
}
