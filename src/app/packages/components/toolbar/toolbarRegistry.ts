import { isHideableToolbarControl, isToolbarControlShown, orderedToolbarIds, type ToolbarControlOverrides } from "../../../settings/toolbarControls"
import { PANEL_CONTROLS } from "./controls/panelControls"
import { TOOL_CONTROLS } from "./controls/toolControls"
import type { ToolbarControl } from "./toolbarControl"
import type { ToolbarContext } from "./toolbarContext"
import type { ResponsiveToolbarItem } from "./toolbarTypes"

/** Every toolbar control, in the order the bar shows them. */
export const TOOLBAR_REGISTRY: readonly ToolbarControl[] = [...TOOL_CONTROLS, ...PANEL_CONTROLS]

/**
 * The items to show: what the build ships, the view allows and the user has not
 * hidden. With an order chosen by the user, that order sets the bar and, since
 * the leftmost control stays longest, what moves into "More tools" first;
 * without one, the bar follows the registry and each control its own priority.
 */
export function toolbarItems(
  ctx: ToolbarContext,
  options: { dm: boolean; overrides: ToolbarControlOverrides | undefined; order: readonly string[] },
): ResponsiveToolbarItem[] {
  const items = TOOLBAR_REGISTRY
    .filter(control => control.available && (options.dm || !control.dmOnly))
    .filter(control => !isHideableToolbarControl(control.id) || isToolbarControlShown(options.overrides, control.id))
    .map(control => ({ ...control.item(ctx), id: control.id, priority: control.priority }))
  if (options.order.length === 0) return items

  const rank = orderedToolbarIds(TOOLBAR_REGISTRY.map(control => control.id), options.order)
  const ranked = items.sort((a, b) => rank.indexOf(a.id) - rank.indexOf(b.id))
  return ranked.map((item, index) => ({ ...item, priority: ranked.length - index }))
}
