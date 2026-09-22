import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { InitiativeEntry } from '../types/initiativeTypes';
import type { AtlasSettings, SettingsService } from './SettingsService';
import './player-initiative.scss';

type PlayerSettings = AtlasSettings['localPlayerView'];

/** Read-only initiative projection; never mounts the DM tracker or its controls. */
export class PlayerInitiativePanel {
  private readonly container: HTMLElement;
  private state: ViewAtlasState | undefined;
  private isHeld = false;
  private unsubscribeStore: (() => void) | undefined;
  private readonly unsubscribeSettings: () => void;

  constructor(parent: HTMLElement, private app: App, private settings: SettingsService) {
    this.container = parent.createDiv({ cls: 'atlas-player-initiative-container' });
    this.unsubscribeSettings = settings.onChange(() => this.render());
  }

  /** Bind to the presented view, including when it belongs to a different Atlas leaf. */
  present(store: StoreApi<ViewAtlasState>): void {
    this.unsubscribeStore?.();
    this.isHeld = false;
    this.state = store.getState();
    this.render();
    this.unsubscribeStore = store.subscribe((state, previous) => {
      const visibilityChanged = state.initiativeTrackerOpen !== previous.initiativeTrackerOpen;
      if (this.isHeld && this.state) {
        if (visibilityChanged) {
          this.state = { ...this.state, initiativeTrackerOpen: state.initiativeTrackerOpen };
          this.render();
        }
        return;
      }
      this.state = state;
      if (visibilityChanged || state.initiative !== previous.initiative || state.objects?.tokens !== previous.objects?.tokens) {
        this.render();
      }
    });
  }

  /** Preserve this scene while browsing other tabs, but keep following DM visibility. */
  hold(): void {
    this.isHeld = true;
  }

  destroy(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
    this.unsubscribeSettings();
    this.state = undefined;
  }

  private render(): void {
    this.container.empty();
    const settings = this.settings.getLocalPlayerViewSettings();
    const initiative = this.state?.initiative;
    if (!settings.showInitiative || !this.state?.initiativeTrackerOpen || !initiative) return;
    const tokens = this.state?.objects?.tokens;
    const entries = initiative.entries
      .filter(entry => tokens?.[entry.tokenId] && !tokens[entry.tokenId]?.isHidden)
      .sort((a, b) => a.order - b.order);
    if (!entries.length) return;

    const panel = this.container.createDiv({
      cls: 'atlas-player-initiative',
      attr: { role: 'region', 'aria-label': 'Initiative order' },
    });
    const list = panel.createDiv({ cls: 'atlas-player-initiative__list', attr: { role: 'list' } });
    for (const entry of entries) this.renderEntry(list, entry, settings, initiative.isActive);
    if (initiative.isActive) {
      panel.createDiv({ cls: 'atlas-player-initiative__round', text: `Round ${initiative.round}` });
    }
  }

  private renderEntry(parent: HTMLElement, entry: InitiativeEntry, settings: PlayerSettings, combatActive: boolean): void {
    const card = parent.createDiv({ cls: 'atlas-player-initiative__card', attr: { role: 'listitem' } });
    if (combatActive && entry.isActive) {
      card.addClass('atlas-player-initiative__card--active');
      card.setAttribute('aria-current', 'true');
    }
    if (entry.imagePath) {
      const src = /^(?:https?:|data:|blob:|app:)/.test(entry.imagePath)
        ? entry.imagePath : this.app.vault.adapter.getResourcePath(entry.imagePath);
      card.createEl('img', {
        cls: 'atlas-player-initiative__avatar',
        attr: { src, alt: settings.showTokenNameplates ? entry.name : '' },
      });
    }
    card.createSpan({ cls: 'atlas-player-initiative__value', text: String(entry.initiative) });
    if (settings.showTokenNameplates) {
      card.createSpan({ cls: 'atlas-player-initiative__name', text: entry.name });
    }
    if (settings.showTokenHP && entry.hp.max > 0) {
      card.createEl('progress', {
        cls: 'atlas-player-initiative__hp',
        attr: { max: entry.hp.max, value: Math.max(0, entry.hp.current), 'aria-label': 'HP' },
      });
    }
  }
}
