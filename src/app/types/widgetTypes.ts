import type { WidgetIcon } from './widgetIcons';

export type { WidgetIcon };

export type WidgetType = 'counter' | 'timer';

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
