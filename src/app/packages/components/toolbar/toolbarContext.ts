import type React from "react"
import type { DiceDropdownMenuProps } from "../../../react/components/dice/DiceDropdownMenu"
import type { MapHotkeyId } from "../../../keyboard/mapHotkeys"
import type { Tool } from "./toolFaces"
import type { ToolGroupControls } from "./ToolGroup"

/** Tool groups whose options menu is open; only one at a time. */
export type ToolMenu = 'move' | 'fog' | 'draw' | 'text' | 'measure' | 'wall'

/** What MainToolbar hands every control definition to build its toolbar item from. */
export interface ToolbarContext {
  activeTool: Tool
  selectTool: (tool: Tool) => void
  hotkeyLabel: (id: MapHotkeyId) => string
  openMenu: ToolMenu | null
  groupControls: (menu: ToolMenu) => ToolGroupControls
  dice: { open: boolean; toggle: () => void; tool: DiceDropdownMenuProps["diceTool"] | null; buttonRef: React.RefObject<HTMLDivElement | null> }
  loot: { open: boolean; setOpen: (open: boolean) => void }
  assets: { open: boolean; openManager: () => void }
  palette: { open: boolean; setOpen: (open: boolean) => void }
}
