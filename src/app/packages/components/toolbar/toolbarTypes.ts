import type React from "react"

/** How a control that moved into the toolbar's overflow menu shows there. */
export interface ToolbarMenuEntry {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  /** Shows the check mark: the tool in use, or a view option that is on. */
  isActive: boolean
  onSelect: () => void
}

/** One control of the main toolbar. */
export interface ResponsiveToolbarItem {
  id: string
  /** Controls with a lower priority move into the overflow menu first. */
  priority: number
  /**
   * Keeps the control in the bar: the tool in use, and any control whose menu or
   * panel is open, since those hang from the control's button.
   */
  pinned: boolean
  element: React.ReactNode
  menuEntry: ToolbarMenuEntry
}
