import { t } from '../../../i18n';
import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Ellipsis } from "lucide-react"
import { cn } from "src/utils/cn"
import { ToolButton } from "../primitives/ToolButton"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { useKeepInView } from "../primitives/useKeepInView"
import type { ResponsiveToolbarItem } from "./toolbarTypes"

const MENU_LABEL = t('toolbar.moreTools')

interface ToolbarOverflowMenuProps {
  /** The controls that did not fit into the bar, in bar order. */
  items: readonly ResponsiveToolbarItem[]
}

/** Index of the menu item an arrow key moves to, or null for other keys. */
function nextMenuIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowDown": return (current + 1) % count
    case "ArrowUp": return current <= 0 ? count - 1 : current - 1
    case "Home": return 0
    case "End": return count - 1
    default: return null
  }
}

/**
 * The toolbar's last button: a menu with the controls that did not fit into
 * the bar. Choosing a tool here makes it the active tool, which brings it back
 * into the bar with its options. Opened from the keyboard, the menu focuses
 * its first item; arrow keys move through it and Escape returns to the button.
 */
export function ToolbarOverflowMenu({ items }: ToolbarOverflowMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const openedFromKeyboard = useRef(false)
  const keepInView = useKeepInView(menuRef, open, "top")

  const trigger = (): HTMLButtonElement | null => rootRef.current?.querySelector("button") ?? null
  const menuItems = (): HTMLButtonElement[] => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

  const close = (restoreFocus: boolean): void => {
    setOpen(false)
    if (restoreFocus) trigger()?.focus()
  }

  // A press anywhere else (touch included) or Escape closes the menu.
  useEffect(() => {
    const root = rootRef.current
    if (!open || !root) return undefined
    const doc = root.doc
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      setOpen(false)
      if (openedFromKeyboard.current) trigger()?.focus()
    }
    doc.addEventListener("pointerdown", onPointerDown, true)
    doc.addEventListener("keydown", onKeyDown)
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, true)
      doc.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  useLayoutEffect(() => {
    if (open && openedFromKeyboard.current) menuItems()[0]?.focus()
  }, [open])

  const toggle = (): void => {
    openedFromKeyboard.current = trigger()?.matches(":focus-visible") ?? false
    setOpen((wasOpen) => !wasOpen)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Tab") {
      setOpen(false)
      return
    }
    const buttons = menuItems()
    const next = nextMenuIndex(event.key, buttons.indexOf(event.target as HTMLButtonElement), buttons.length)
    if (next === null || buttons.length === 0) return
    // Arrow keys also drive map shortcuts (initiative turns); the menu has them first.
    event.preventDefault()
    event.stopPropagation()
    buttons[next]?.focus()
  }

  return (
    <div ref={rootRef} className="atlas-toolbar-overflow">
      <ToolButton icon={Ellipsis} label={MENU_LABEL} isActive={false} menuExpanded={open} onClick={toggle} />
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={MENU_LABEL}
          className={cn(
            "atlas-dropdown-content atlas-dropdown-content--top atlas-dropdown-content--right",
            keepInView.capped && "atlas-keep-in-view--capped",
          )}
          style={keepInView.style}
          onKeyDown={onMenuKeyDown}
        >
          <div className="atlas-dropdown-section">
            {items.map(({ id, menuEntry }) => (
              <DropdownMenuItem
                key={id}
                role="menuitem"
                icon={menuEntry.icon}
                label={menuEntry.label}
                {...(menuEntry.shortcut !== undefined && { shortcut: menuEntry.shortcut })}
                isActive={menuEntry.isActive}
                onClick={() => {
                  close(openedFromKeyboard.current)
                  menuEntry.onSelect()
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
