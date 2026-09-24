import type { WidgetIcon } from './widgetIcons';

export type { WidgetIcon };

export type WidgetType = 'counter' | 'timer';

/**
 * `scene` widgets belong to one map; `collection` widgets appear with the same value
 * in every scene of the map's collection and are stored in its settings.
 */
export type WidgetScope = 'scene' | 'collection';

export interface Widget {
  id: string;
  type: WidgetType;
  label: string;
  icon: WidgetIcon;
  visible: boolean;
  visibleToPlayers: boolean;
  value: number;
  color?: string;
  order: number;
  /** Unset means `scene`. */
  scope?: WidgetScope;
}

export interface CounterWidget extends Widget {
  type: 'counter';
  min?: number;
  max?: number;
}

export interface TimerWidget extends Widget {
  type: 'timer';
  value: number;       // remainingSeconds (persisted)
  duration: number;    // total configured seconds
  direction: 'down';
}

export type AnyWidget = CounterWidget | TimerWidget;

export interface WidgetSettings {
  widgets: Record<string, AnyWidget>;
  globalVisible: boolean;
  position: 'top' | 'bottom' | 'left' | 'right';
  scale: number;
}
