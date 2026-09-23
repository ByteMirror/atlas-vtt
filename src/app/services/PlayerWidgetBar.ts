import type { ViewAtlasState } from '../storeFactory';
import type { CounterWidget } from '../types/widgetTypes';
import { WIDGET_ICON_PATHS, WIDGET_ICON_VIEW_BOX, resolveWidgetIcon } from '../types/widgetIcons';
import { DEFAULT_COUNTER_COLOR, readCounterValue } from '../utils/counterWidget';
import { PlayerSceneOverlay, type PlayerSettings } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';

type WidgetScene = Pick<ViewAtlasState, 'widgetSettings' | 'widgetValues'>;

/** Read-only widget bar showing the presented scene's player-visible widgets. */
export class PlayerWidgetBar extends PlayerSceneOverlay<WidgetScene> {
  constructor(settings: SettingsService) {
    super({ cls: 'atlas-vtt-plugin', attr: { id: 'atlas-player-widgets' } }, settings);
  }

  protected select({ widgetSettings, widgetValues }: ViewAtlasState): WidgetScene {
    return { widgetSettings, widgetValues };
  }

  protected render(container: HTMLElement, scene: WidgetScene, settings: PlayerSettings): void {
    const { widgetSettings } = scene;
    if (!settings.showWidgets || !widgetSettings?.globalVisible) return;

    // Only counters are shown to players for now.
    const counters = Object.values(widgetSettings.widgets)
      .filter((widget): widget is CounterWidget => widget.type === 'counter' && widget.visible && widget.visibleToPlayers)
      .sort((a, b) => a.order - b.order);
    if (counters.length === 0) return;

    const widgetBar = container.createDiv({ cls: `atlas-widget-bar atlas-widget-bar-${widgetSettings.position}` });
    const widgetContainer = widgetBar.createDiv({ cls: 'atlas-widget-container' });
    widgetContainer.style.transform = `scale(${widgetSettings.scale || 1})`;
    for (const counter of counters) this.renderCounter(widgetContainer, counter, readCounterValue(scene, counter));
  }

  /**
   * Appends a counter element to `parent`. Building it through the parent keeps it
   * in the popout's document, where Obsidian installs the same DOM helpers.
   */
  private renderCounter(parent: HTMLElement, widget: CounterWidget, value: number): void {
    const widgetEl = parent.createDiv({ cls: 'atlas-widget atlas-widget-counter' });
    widgetEl.style.setProperty('--widget-color', widget.color || DEFAULT_COUNTER_COLOR);
    widgetEl.createDiv({ cls: 'atlas-widget-icon-wrapper' })
      .createSvg('svg', { attr: { viewBox: WIDGET_ICON_VIEW_BOX, fill: 'currentColor' } })
      .createSvg('path', { attr: { d: WIDGET_ICON_PATHS[resolveWidgetIcon(widget.icon)] } });

    const content = widgetEl.createDiv({ cls: 'atlas-widget-content' });
    const valueRow = content.createDiv({ cls: 'atlas-widget-value-row' });
    valueRow.createSpan({ cls: 'atlas-widget-value', text: String(value) });
    content.createDiv({ cls: 'atlas-widget-label', text: widget.label });
  }
}
