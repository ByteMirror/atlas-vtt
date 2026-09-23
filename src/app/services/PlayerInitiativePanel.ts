import type { App } from 'obsidian';
import type { ViewAtlasState } from '../storeFactory';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { PlayerSceneOverlay } from './PlayerSceneOverlay';
import type { AtlasSettings, SettingsService } from './SettingsService';
import './player-initiative.scss';

type PlayerSettings = AtlasSettings['localPlayerView'];

/** Read-only initiative projection; never mounts the DM tracker or its controls. */
export class PlayerInitiativePanel extends PlayerSceneOverlay {
  constructor(parent: HTMLElement, private readonly app: App, settings: SettingsService) {
    super(parent.createDiv({ cls: 'atlas-player-initiative-container' }), settings);
  }

  protected hasChanged(state: ViewAtlasState, previous: ViewAtlasState): boolean {
    return state.initiativeTrackerOpen !== previous.initiativeTrackerOpen ||
      state.initiative !== previous.initiative ||
      state.objects?.tokens !== previous.objects?.tokens;
  }

  protected render(state: ViewAtlasState): void {
    const settings = this.settings.getLocalPlayerViewSettings();
    const { initiative } = state;
    if (!settings.showInitiative || !state.initiativeTrackerOpen || !initiative) return;
    const tokens = state.objects?.tokens;
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
