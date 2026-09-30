import type { ResponsiveToolbarItem } from "./toolbarTypes"
import type { ToolbarContext } from "./toolbarContext"

/** A control's element and overflow entry; the registry adds its id and priority. */
export type ToolbarItemBody = Omit<ResponsiveToolbarItem, "id" | "priority">

/** One control of the main toolbar, described once. */
export interface ToolbarControl {
  /** Also the id of a hideable control in the user's toolbar settings (`settings/toolbarControls.ts`). */
  id: string
  /** Controls with a lower priority move into the overflow menu first. */
  priority: number
  dmOnly: boolean
  /** Build-level gate: a control of a feature that is not shipped never shows. */
  available: boolean
  item: (ctx: ToolbarContext) => ToolbarItemBody
}
