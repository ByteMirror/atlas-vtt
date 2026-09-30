import React from "react"
import { ToolButton } from "../primitives/ToolButton"
import type { ToolFace } from "./toolFaces"
import type { ToolbarItemBody } from "./toolbarControl"
import type { ToolbarContext, ToolMenu } from "./toolbarContext"

/** A tool group: pinned while its tool is active or its options are open. */
export function toolGroupItem(
  ctx: ToolbarContext,
  menu: ToolMenu,
  face: ToolFace,
  element: React.ReactNode,
): ToolbarItemBody {
  return {
    pinned: face.isActive || ctx.openMenu === menu,
    element,
    menuEntry: { icon: face.icon, label: face.label, shortcut: ctx.hotkeyLabel(menu), isActive: face.isActive, onSelect: () => ctx.selectTool(face.tool) },
  }
}

interface ButtonItemOptions {
  icon: ToolFace["icon"]
  label: string
  shortcut: string
  isActive: boolean
  onClick: () => void
  /** Tools pin while active; panels that float on their own never pin. */
  pinned: boolean
}

/** A plain button for a tool or a panel. */
export function buttonItem({ pinned, ...button }: ButtonItemOptions): ToolbarItemBody {
  return {
    pinned,
    element: <ToolButton {...button} />,
    menuEntry: { icon: button.icon, label: button.label, shortcut: button.shortcut, isActive: button.isActive, onSelect: button.onClick },
  }
}
