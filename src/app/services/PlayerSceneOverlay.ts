import type { StoreApi } from 'zustand';
import { shallow } from 'zustand/vanilla/shallow';
import type { ViewAtlasState } from '../storeFactory';
import type { SettingsService } from './SettingsService';

/**
 * A player window overlay drawn from the presented scene's view store.
 *
 * All scene tabs of a view share one store, so while the DM browses another tab
 * it holds a different map. `hold` therefore keeps the presented scene until
 * `present` binds the overlay to a scene again. Overlays keep only the plain data
 * `select` picks, so a held overlay never keeps the store or a closed map alive.
 */
export abstract class PlayerSceneOverlay<Scene extends object> {
  private scene: Scene | undefined;
  private unsubscribeStore: (() => void) | undefined;
  private readonly unsubscribeSettings: () => void;

  protected constructor(protected readonly container: HTMLElement, protected readonly settings: SettingsService) {
    this.unsubscribeSettings = settings.onChange(() => this.refresh());
  }

  /** Bind to the presented view, including when it belongs to a different Atlas leaf. */
  present(store: StoreApi<ViewAtlasState>): void {
    this.unsubscribeStore?.();
    this.scene = this.select(store.getState());
    this.refresh();
    this.unsubscribeStore = store.subscribe((state) => {
      const scene = this.select(state);
      if (this.scene && shallow(this.scene, scene)) return;
      this.scene = scene;
      this.refresh();
    });
  }

  /**
   * Freeze the presented scene while the DM browses other scene tabs. Views switch
   * the active tab before loading the next map, so the kept scene is still the presented one.
   */
  hold(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
  }

  destroy(): void {
    this.hold();
    this.unsubscribeSettings();
  }

  /** Picks the store values this overlay shows; a shallow change triggers a re-render. */
  protected abstract select(state: ViewAtlasState): Scene;

  /** Fills the emptied container from the presented `scene`. */
  protected abstract render(scene: Scene): void;

  private refresh(): void {
    this.container.empty();
    if (this.scene) this.render(this.scene);
  }
}
