import type { ViewAtlasState } from '../storeFactory';
import type { CounterWidget } from '../types/widgetTypes';
import { WIDGET_ICON_PATHS, resolveWidgetIcon } from '../types/widgetIcons';
import { DEFAULT_COUNTER_COLOR, readCounterValue } from '../utils/counterWidget';
import { createSvgElement } from '../utils/svgElement';
import { PlayerSceneOverlay } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';

/** Read-only widget bar showing the presented scene's player-visible widgets. */
export class PlayerWidgetBar extends PlayerSceneOverlay {
  constructor(parent: HTMLElement, settings: SettingsService) {
    super(parent.createDiv({ cls: 'atlas-vtt-plugin', attr: { id: 'atlas-player-widgets' } }), settings);
  }

  protected hasChanged(state: ViewAtlasState, previous: ViewAtlasState): boolean {
    return state.widgetSettings !== previous.widgetSettings || state.widgetValues !== previous.widgetValues;
  }

  protected render(state: ViewAtlasState): void {
    const { widgetSettings } = state;
    if (!this.settings.getLocalPlayerViewSettings().showWidgets || !widgetSettings?.globalVisible) return;

    // Only counters are shown to players for now.
    const counters = Object.values(widgetSettings.widgets)
      .filter((widget): widget is CounterWidget => widget.type === 'counter' && widget.visible && widget.visibleToPlayers)
      .sort((a, b) => a.order - b.order);
    if (counters.length === 0) return;

    const widgetBar = this.container.createDiv({ cls: `atlas-widget-bar atlas-widget-bar-${widgetSettings.position}` });
    const widgetContainer = widgetBar.createDiv({ cls: 'atlas-widget-container' });
    widgetContainer.style.transform = `scale(${widgetSettings.scale || 1})`;
    for (const counter of counters) this.renderCounter(widgetContainer, counter, readCounterValue(state, counter));
  }

  /**
   * Appends a counter element to `parent`. Building it through the parent keeps it
   * in the popout's document, where Obsidian installs the same DOM helpers.
   */
  private renderCounter(parent: HTMLElement, widget: CounterWidget, value: number): void {
    const doc = parent.ownerDocument;
    const widgetEl = parent.createDiv({ cls: 'atlas-widget atlas-widget-counter' });
    widgetEl.style.setProperty('--widget-color', widget.color || DEFAULT_COUNTER_COLOR);
    const iconWrapper = widgetEl.createDiv({ cls: 'atlas-widget-icon-wrapper' });
    const icon = createSvgElement(doc, 'svg', { viewBox: '0 0 512 512', fill: 'currentColor' });
    icon.appendChild(createSvgElement(doc, 'path', { d: WIDGET_ICON_PATHS[resolveWidgetIcon(widget.icon)] }));
    iconWrapper.appendChild(icon);

    const content = widgetEl.createDiv({ cls: 'atlas-widget-content' });
    const valueRow = content.createDiv({ cls: 'atlas-widget-value-row' });
    valueRow.createSpan({ cls: 'atlas-widget-value', text: String(value) });
    content.createDiv({ cls: 'atlas-widget-label', text: widget.label });
  }
}
