import type { ViewAtlasState } from '../storeFactory';
import type { CounterWidget } from '../types/widgetTypes';

export const DEFAULT_COUNTER_COLOR = '#ffc107';

/** Clamps a counter value to the widget's range (0–99 unless configured). */
export function clampCounterValue(widget: Pick<CounterWidget, 'min' | 'max'>, value: number): number {
  return Math.min(widget.max ?? 99, Math.max(widget.min ?? 0, value));
}

/** Current value of a counter: the undo-tracked `widgetValues` entry wins over the definition's copy. */
export function readCounterValue(state: Pick<ViewAtlasState, 'widgetValues'>, widget: CounterWidget): number {
  const value = state.widgetValues?.[widget.id] ?? widget.value;
  return typeof value === 'number' ? value : 0;
}
