import React, { forwardRef, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { observeResize } from "../../../utils/observeResize"
import { overflowingToolbarItems } from "./toolbarFit"
import { ToolbarOverflowMenu } from "./ToolbarOverflowMenu"
import { ToolbarSpaceContext } from "./toolbarSpace"
import type { ResponsiveToolbarItem } from "./toolbarTypes"

/** What the fit needs to know about the rendered bar. */
interface BarGeometry {
  /** Last measured width of every item that has been in the bar. */
  widths: Readonly<Record<string, number>>
  chrome: number
  gap: number
  overflowButtonWidth: number
}

function sameGeometry(a: BarGeometry | null, b: BarGeometry): boolean {
  if (!a || a.chrome !== b.chrome || a.gap !== b.gap || a.overflowButtonWidth !== b.overflowButtonWidth) return false
  const ids = Object.keys(b.widths)
  return ids.length === Object.keys(a.widths).length && ids.every((id) => a.widths[id] === b.widths[id])
}

/**
 * Reads the bar's padding, border and gap, and the width of every item in it.
 * Items in the overflow menu keep the width they had when last shown, as long
 * as the bar's style stays the same: once it changes (the plugin's stylesheet
 * arriving after the first render, a theme switch), they are forgotten, so the
 * fit shows them again to measure them. The control fixed at the end counts
 * as chrome, with the gap before it. The overflow button is a square icon
 * button, so before it has ever shown, the bar's content height stands in for
 * its width.
 */
function measureBar(bar: HTMLElement, previous: BarGeometry | null): BarGeometry {
  const style = bar.win.getComputedStyle(bar)
  const px = (value: string): number => parseFloat(value) || 0
  const overflowButton = bar.querySelector<HTMLElement>(":scope > .atlas-toolbar-overflow")
  const endControl = bar.querySelector<HTMLElement>(":scope > .atlas-toolbar-end")
  const contentHeight = bar.clientHeight - px(style.paddingTop) - px(style.paddingBottom)
  const gap = px(style.columnGap)
  const chrome = px(style.paddingLeft) + px(style.paddingRight) + px(style.borderLeftWidth) + px(style.borderRightWidth)
    + (endControl ? endControl.offsetWidth + gap : 0)
  const sameStyle = previous?.chrome === chrome && previous.gap === gap
  const widths: Record<string, number> = sameStyle ? { ...previous.widths } : {}
  for (const item of Array.from(bar.querySelectorAll<HTMLElement>(":scope > [data-toolbar-item]"))) {
    const id = item.dataset.toolbarItem
    if (id && !item.hidden && item.offsetWidth > 0) widths[id] = item.offsetWidth
  }
  return {
    widths,
    chrome,
    gap,
    overflowButtonWidth: overflowButton?.offsetWidth || (sameStyle ? previous.overflowButtonWidth : 0) || contentHeight,
  }
}

interface ResponsiveToolbarProps {
  items: readonly ResponsiveToolbarItem[]
  /** A control that always stays at the very end of the bar, after the overflow button. */
  end?: React.ReactNode
}

/**
 * The main toolbar's bar. When its row has less room than all controls need,
 * controls move into a "More tools" menu at the end of the bar, lowest
 * priority first; the rest keep their order. Pinned controls (the tool in
 * use, a control whose menu or panel is open) always stay, and so does the
 * `end` control, which keeps the bar's last place. Every control stays
 * mounted while it is in the menu, so tool options keep their state and the
 * bar can measure it again once it returns.
 */
export const ResponsiveToolbar = forwardRef<HTMLDivElement, ResponsiveToolbarProps>(({ items, end }, forwardedRef) => {
  const space = useContext(ToolbarSpaceContext)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [geometry, setGeometry] = useState<BarGeometry | null>(null)

  const setBar = useCallback((element: HTMLDivElement | null): void => {
    barRef.current = element
    if (typeof forwardedRef === "function") forwardedRef(element)
    else if (forwardedRef) forwardedRef.current = element
  }, [forwardedRef])

  const measure = useCallback((): void => {
    const bar = barRef.current
    if (!bar) return
    setGeometry((previous) => {
      const next = measureBar(bar, previous)
      return sameGeometry(previous, next) ? previous : next
    })
  }, [])

  // Before paint after every render: an item may have appeared or changed width.
  useLayoutEffect(measure)

  // Style changes that never re-render (theme, zoom) reach the bar's size.
  useEffect(() => {
    const bar = barRef.current
    return bar ? observeResize([bar], measure) : undefined
  }, [measure])

  const hidden = useMemo(() => {
    if (space === null || !geometry) return new Set<string>()
    return overflowingToolbarItems(
      items.map(({ id, priority, pinned }) => ({ id, priority, pinned, width: geometry.widths[id] })),
      { available: space, chrome: geometry.chrome, gap: geometry.gap, overflowButtonWidth: geometry.overflowButtonWidth },
    )
  }, [items, space, geometry])

  const overflowItems = items.filter((item) => hidden.has(item.id))

  return (
    <div ref={setBar} className="atlas-vtt-toolbar">
      {items.map((item) => (
        <div key={item.id} className="atlas-toolbar-item" data-toolbar-item={item.id} hidden={hidden.has(item.id)}>
          {item.element}
        </div>
      ))}
      {overflowItems.length > 0 && <ToolbarOverflowMenu items={overflowItems} />}
      {end && <div className="atlas-toolbar-end">{end}</div>}
    </div>
  )
})

ResponsiveToolbar.displayName = "ResponsiveToolbar"
