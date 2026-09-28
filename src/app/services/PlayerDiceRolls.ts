import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { PlayerDiceToasts } from '../react/components/dice/PlayerDiceToasts';
import type { PlayerOverlay } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';

/**
 * Shows the DM's dice rolls in the player window while the DM lets players see
 * them (`localPlayerView.showDiceRolls`), as the same toasts the DM gets.
 */
export class PlayerDiceRolls implements PlayerOverlay {
  private host: HTMLElement | undefined;
  private root: Root | undefined;
  private store: StoreApi<ViewAtlasState> | undefined;
  private isShown: boolean;
  private readonly unsubscribeSettings: () => void;

  constructor(private readonly app: App, settings: SettingsService) {
    this.isShown = settings.getLocalPlayerViewSettings().showDiceRolls;
    this.unsubscribeSettings = settings.onChange(({ localPlayerView }) => {
      if (localPlayerView.showDiceRolls === this.isShown) return;
      this.isShown = localPlayerView.showDiceRolls;
      this.render();
    });
  }

  mount(parent: HTMLElement): void {
    this.unmount();
    this.host = parent.createDiv({ cls: 'atlas-player-dice-rolls' });
    this.root = createRoot(this.host);
    this.render();
  }

  present(store: StoreApi<ViewAtlasState>): void {
    this.store = store;
    this.render();
  }

  /** Rolls keep showing while the DM browses other scene tabs. */
  hold(): void {}

  destroy(): void {
    this.unsubscribeSettings();
    this.unmount();
  }

  private render(): void {
    if (!this.root || !this.host) return;
    const { app, store, host } = this;
    this.root.render(this.isShown && store ? createElement(PlayerDiceToasts, { app, store, container: host }) : null);
  }

  private unmount(): void {
    this.root?.unmount();
    this.host?.remove();
    this.root = undefined;
    this.host = undefined;
  }
}
