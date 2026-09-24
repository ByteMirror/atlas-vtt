import { shallow } from 'zustand/vanilla/shallow';
import type { AnyWidget, WidgetSettings } from '../types/widgetTypes';

export type WidgetRecord = WidgetSettings['widgets'];
export type WidgetValues = Record<string, number>;

/** The widget slice of a scene: definitions plus the undo-tracked values. */
export interface SceneWidgets {
  widgets: WidgetRecord;
  widgetValues: WidgetValues;
}

export function isCollectionWidget(widget: AnyWidget): boolean {
  return widget.scope === 'collection';
}

/** Counters keep their current value in the undo-tracked `widgetValues`, timers on the definition. */
function currentValue(widget: AnyWidget, widgetValues: WidgetValues): number {
  return widget.type === 'counter' ? widgetValues[widget.id] ?? widget.value : widget.value;
}

/**
 * The scene's collection-wide widgets as stored in the collection settings:
 * each definition carries its current value, since collections keep no separate values.
 */
export function pickCollectionWidgets({ widgets, widgetValues }: SceneWidgets): WidgetRecord {
  const shared: WidgetRecord = {};
  for (const widget of Object.values(widgets)) {
    if (!isCollectionWidget(widget)) continue;
    const value = currentValue(widget, widgetValues);
    shared[widget.id] = widget.value === value ? widget : { ...widget, value };
  }
  return shared;
}

/** Replaces the scene's collection-wide widgets with `shared`, keeping its own widgets. */
export function withCollectionWidgets(scene: SceneWidgets, shared: WidgetRecord): SceneWidgets {
  const { widgets, widgetValues } = withoutCollectionWidgets(scene);
  const merged: SceneWidgets = { widgets: { ...widgets }, widgetValues: { ...widgetValues } };
  for (const widget of Object.values(shared)) {
    merged.widgets[widget.id] = widget;
    if (widget.type === 'counter') merged.widgetValues[widget.id] = widget.value;
  }
  return merged;
}

/**
 * The widgets that belong to the scene file. Collection-wide widgets live in the
 * collection settings, so scene files never hold stale copies of them.
 */
export function withoutCollectionWidgets(scene: SceneWidgets): SceneWidgets {
  const sharedIds = Object.values(scene.widgets).filter(isCollectionWidget).map((widget) => widget.id);
  if (sharedIds.length === 0) return scene;

  const widgets = { ...scene.widgets };
  const widgetValues = { ...scene.widgetValues };
  for (const id of sharedIds) {
    delete widgets[id];
    delete widgetValues[id];
  }
  return { widgets, widgetValues };
}

/** True when both records hold the same widgets with the same fields. */
export function sameWidgets(a: WidgetRecord, b: WidgetRecord): boolean {
  const ids = Object.keys(a);
  if (ids.length !== Object.keys(b).length) return false;
  return ids.every((id) => {
    const other = b[id];
    return other !== undefined && shallow(a[id], other);
  });
}
